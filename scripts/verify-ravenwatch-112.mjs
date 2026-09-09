import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import nbt from 'prismarine-nbt';
import { chromium, expect } from '@playwright/test';
import { compileBuildSpec } from '../packages/block-compiler/src/compileBuildSpec.ts';
import { ResourcePackManager } from '../apps/server/src/resourcepacks/ResourcePackManager.ts';
import { resolveAppearance } from '../apps/server/src/resourcepacks/resolveAppearance.ts';
import { createHttpServer } from '../apps/server/src/http/createHttpServer.ts';
import { SessionManager } from '../apps/server/src/session/SessionManager.ts';
import { GitProjectService } from '../apps/server/src/git/GitProjectService.ts';

const repo=resolve('.'), dir=join(repo,'builds/ravenwatch-castle-50x40x80-1.12.2');
const liveUrl=process.argv.find(a=>a.startsWith('--url='))?.slice(6);
const spec=JSON.parse(readFileSync(join(dir,'Ravenwatch-Castle.buildspec.json'),'utf8'));
const built=compileBuildSpec(spec), v=built.volume;
const exported=readFileSync(join(dir,'Ravenwatch-Castle-1.12.2.schematic'));
const {parsed}=await nbt.parse(exported), data=nbt.simplify(parsed);
expect([data.Width,data.Height,data.Length]).toEqual([50,80,40]);
expect(data.Materials).toBe('Alpha');expect(data.Blocks.length).toBe(160000);expect(data.Data.length).toBe(160000);
expect(spec.minecraftVersion).toBe('1.12.2');expect(built.warnings).toEqual([]);
// Fixed 1.12.2 ID/data references, independent of the writer's mapping tables.
const expected={
  nether_bricks:[112,0],cobblestone:[4,0],polished_andesite:[1,6],stone_bricks:[98,0],
  spruce_planks:[5,1],crafting_table:[58,0],mossy_stone_bricks:[98,1],
  'stone_brick_slab[type=bottom]':[44,5],grass_block:[2,0],'water[level=0]':[9,0],dark_oak_fence:[191,0],
  cracked_stone_bricks:[98,2],torch:[50,5],'ladder[facing=north]':[65,2],andesite:[1,5],
  fern:[31,2],poppy:[38,0],red_carpet:[171,14],light_blue_stained_glass:[95,3],
  'spruce_slab[type=top]':[126,9],red_wool:[35,14],yellow_wool:[35,4],bookshelf:[47,0],
  'dark_oak_log[axis=z]':[162,9],'dark_oak_log[axis=y]':[162,1],dark_oak_planks:[5,5],gold_block:[41,0],air:[0,0],
  'iron_bars[north=false,south=false,east=true,west=true]':[101,0],
  'iron_bars[north=true,south=true,east=false,west=false]':[101,0],
};
for(const [name,id]of [['stone_brick_stairs',109],['spruce_stairs',134],['dark_oak_stairs',164]]){
  for(const [facing,meta]of [['east',0],['west',1],['south',2],['north',3]]){
    expected[`${name}[facing=${facing},half=bottom,shape=straight]`]=[id,meta];
    expected[`${name}[half=bottom,shape=straight,facing=${facing}]`]=[id,meta];
  }
}
let nonAir=0;
v.forEachYZX((x,y,z,state)=>{
  const i=x+50*(z+40*y), pair=expected[state.replace('minecraft:','')];
  if(!pair)throw new Error('Missing independent ID reference for '+state);
  if((data.Blocks[i]&255)!==pair[0]||(data.Data[i]&15)!==pair[1])throw new Error('Export mismatch at '+[x,y,z]+': '+state);
  if(pair[0])nonAir++;
});
expect(nonAir).toBe(26904);

const packsDir=join(repo,'resourcepacks'), base=join(packsDir,'.base/minecraft-1.12.2.jar');
const manager=new ResourcePackManager(packsDir,base);
const pack=manager.list().packs.find(p=>p.kind==='zip'&&p.status==='ready');
if(!pack)throw new Error('User resource pack is unavailable');
const appearance=resolveAppearance(manager.resources(pack.id,pack.revision),built.palette);
const missing=Object.entries(appearance.blocks).filter(([,b])=>b.source==='missing');expect(missing).toEqual([]);
for(const [state,block]of Object.entries(appearance.blocks))if(state.includes('iron_bars'))expect(block.parts).toHaveLength(3);
const report={minecraftVersion:'1.12.2',size:spec.size,bounds:v.getNonAirBounds(),nonAirBlocks:nonAir,fileBytes:exported.length,
  all160000LegacyCellsMatch:true,pack:pack.name,packId:pack.id,packRevision:pack.revision,states:built.palette.length,missing:[],pageErrors:[]};

// Real viewer on an ephemeral test port; no mutation of a running MCP session.
const config={host:'127.0.0.1',port:0,baseUrl:'',mcpMode:true,webDist:join(repo,'apps/web/dist'),resourcePacksDir:packsDir,vanillaJar:base};
const sm=new SessionManager(config,new GitProjectService());expect(sm.build(spec).valid).toBe(true);
let app,browser;
try{
  if(!liveUrl)app=await createHttpServer(sm,config);
  const url=liveUrl??await app.listen({host:'127.0.0.1',port:0});
  browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-angle=swiftshader']});
  const page=await browser.newPage({viewport:{width:1600,height:1200},deviceScaleFactor:1});
  await page.addInitScript(id=>{localStorage.setItem('msl-resource-pack-112',id);localStorage.setItem('msl-language','zh');},pack.id);
  page.on('pageerror',e=>report.pageErrors.push(e.message));
  await page.goto(url);
  await expect(page.getByTestId('pack-coverage')).toContainText(/(?:unsupported|不支持) 0/,{timeout:30000});
  await expect(page.locator('.resource-pack-panel select')).toHaveValue(pack.id);
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  const canvas=page.locator('canvas').first(), rect=await canvas.boundingBox();
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
  for(let i=0;i<12;i++){await page.mouse.wheel(0,-100);await page.waitForTimeout(40);}
  await page.waitForTimeout(400);
  await page.screenshot({path:join(dir,'preview-user-pack-rear.png')});
  // Orbit half a turn through the actual viewer controls to show the north gate.
  const center={x:rect.x+rect.width/2,y:rect.y+rect.height/2};
  await page.mouse.move(center.x+rect.height/4,center.y);
  await page.mouse.down();await page.mouse.move(center.x-rect.height/4,center.y,{steps:40});await page.mouse.up();
  await page.waitForTimeout(700);
  await page.screenshot({path:join(dir,'preview-user-pack-front.png')});
  await canvas.screenshot({path:join(dir,'castle-user-pack.png')});
  // Verify connected bars and missing fallback are visible as geometry in a small, inspectable scene.
  const detail={id:'render-regression',name:'Renderer verification',minecraftVersion:'1.21',size:{x:12,y:5,z:8},palette:{},operations:[
    {type:'box',from:[0,0,0],to:[11,0,7],block:'minecraft:stone_bricks'},
    {type:'box',from:[1,1,2],to:[1,2,5],block:'minecraft:iron_bars[north=true,south=true,east=false,west=false]'},
    {type:'box',from:[2,1,5],to:[5,2,5],block:'minecraft:iron_bars[north=false,south=false,east=true,west=true]'},
    {type:'box',from:[7,1,3],to:[7,1,3],block:'minecraft:deepslate'},
    {type:'box',from:[9,1,3],to:[9,1,3],block:'minecraft:water[level=0]'},
  ]};
  if(!liveUrl){sm.build(detail);await page.reload();
  await expect(page.getByTestId('pack-coverage')).toContainText(/(?:unsupported|不支持) 1/,{timeout:30000});
  await page.waitForTimeout(500);await page.screenshot({path:join(dir,'renderer-regression.png')});}
  expect(report.pageErrors).toEqual([]);
  writeFileSync(join(dir,'export-verification.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));
}finally{await browser?.close();await app?.close();}
