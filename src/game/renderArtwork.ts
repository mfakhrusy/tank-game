import Phaser from 'phaser';
import { moduleArt,flameArt,VectorArt } from './moduleArt';
import { PARTS } from './config';

// Bake at 2x once, then use a single sprite per module instead of many draw objects.
function paintArtwork(scene:Phaser.Scene,art:VectorArt[]):Phaser.GameObjects.Graphics {
  const graphic=scene.make.graphics({x:0,y:0});
  const scale=2,position=(value:number|undefined)=>(64+(value??0))*scale;
  const color=(value:string)=>parseInt(value.slice(1),16);
  for(const item of art){
    const opacity=item.opacity??1;
    if(item.fill)graphic.fillStyle(color(item.fill),opacity);
    if(item.stroke)graphic.lineStyle((item.strokeWidth??1)*scale,color(item.stroke),opacity);
    const x=position(item.x),y=position(item.y);
    if(item.type==='circle'){
      if(item.fill)graphic.fillCircle(x,y,item.r!*scale);
      if(item.stroke)graphic.strokeCircle(x,y,item.r!*scale);
    }else if(item.type==='ellipse'){
      if(item.fill)graphic.fillEllipse(x,y,item.rx!*2*scale,item.ry!*2*scale);
      if(item.stroke)graphic.strokeEllipse(x,y,item.rx!*2*scale,item.ry!*2*scale);
    }else if(item.type==='rect'){
      if(item.fill)graphic.fillRoundedRect(x,y,item.width!*scale,item.height!*scale,(item.rx??0)*scale);
      if(item.stroke)graphic.strokeRoundedRect(x,y,item.width!*scale,item.height!*scale,(item.rx??0)*scale);
    }else{
      const points=Array.from({length:item.points!.length/2},(_,i)=>new Phaser.Math.Vector2(position(item.points![i*2]),position(item.points![i*2+1])));
      if(item.fill)graphic.fillPoints(points,true);
      if(item.stroke){
        graphic.strokePoints(points,item.type==='polygon');
        if(item.type==='line'){
          graphic.fillStyle(color(item.stroke),opacity);
          const radius=(item.strokeWidth??1)*scale/2;
          for(const point of [points[0],points[points.length-1]])graphic.fillCircle(point.x,point.y,radius);
        }
      }
    }
  }
  return graphic;
}
export function bakeArtwork(scene:Phaser.Scene,key:string,art:VectorArt[]):void {
  if(scene.textures.exists(key))return;
  const graphic=paintArtwork(scene,art);graphic.generateTexture(key,256,256);graphic.destroy();
}
export function bakeModuleAtlas(scene:Phaser.Scene):void {
  if(scene.textures.exists('module-atlas'))return;
  const frames=PARTS.map(part=>({name:part.id,art:moduleArt(part)}));
  for(const part of PARTS.filter(part=>part.shape==='booster'))frames.push({name:`flame-${part.id}`,art:flameArt(part)});
  const atlas=scene.textures.createCanvas('module-atlas',1024,Math.ceil(frames.length/4)*256)!;
  const context=atlas.getContext(),tile=document.createElement('canvas');tile.width=256;tile.height=256;
  for(const [index,frame] of frames.entries()){
    tile.getContext('2d')!.clearRect(0,0,256,256);
    const graphic=paintArtwork(scene,frame.art);graphic.generateTexture(tile,256,256);graphic.destroy();
    const x=index%4*256,y=Math.floor(index/4)*256;
    context.drawImage(tile,x,y);atlas.add(frame.name,0,x,y,256,256);
  }
  atlas.refresh();
}
