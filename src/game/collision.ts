import { TankBuild, getPart } from './config';
import { CORE_RADIUS, attachmentTransform, occupiedMountDepths, LAYER_RADII } from './geometry';
import { EnemyShape } from './enemies';

type Point={x:number;y:number};
type Polygon=Point[];
const polygon=(values:number[]):Polygon=>Array.from({length:values.length/2},(_,i)=>({x:values[i*2],y:values[i*2+1]}));
export const circleOutline=(radius:number)=>ellipse(0,0,radius);
const ellipse=(x:number,y:number,rx:number,ry=rx):Polygon=>Array.from({length:24},(_,i)=>({x:x+Math.cos(i*Math.PI/12)*rx,y:y+Math.sin(i*Math.PI/12)*ry}));
const box=(x:number,y:number,w:number,h:number)=>polygon([x-w/2,y-h/2,x+w/2,y-h/2,x+w/2,y+h/2,x-w/2,y+h/2]);
function transform(points:Polygon,x:number,y:number,angle:number,scale=1):Polygon {
  const c=Math.cos(angle),s=Math.sin(angle);
  return points.map(p=>({x:x+(p.x*c-p.y*s)*scale,y:y+(p.x*s+p.y*c)*scale}));
}
export function tankOutline(build:TankBuild):Polygon[] {
  const shapes:Polygon[]=[ellipse(0,0,CORE_RADIUS+8)];
  for(const {mount,layer} of occupiedMountDepths(build.attachments)){
    const start=CORE_RADIUS-6,end=LAYER_RADII[layer]+30;
    shapes.push(transform(box((start+end)/2,0,end-start,18),0,0,mount*Math.PI/4));
  }
  for(const item of build.attachments){
    const part=getPart(item.partId),pose=attachmentTransform(item.mount,item.layer);
    let outline:Polygon;
    switch(part.shape){
      case 'barrel': outline=box(19,0,58,part.behavior==='bonker'?34:26);break;
      case 'pod': outline=polygon([-15,-18,24,-18,46,0,24,18,-15,18]);break;
      case 'booster': outline=polygon([-28,-19,11,-19,35,-15,35,15,11,19,-28,19]);break;
      case 'plate': outline=polygon([-18,-28,17,-28,30,-20,38,-7,38,7,30,20,17,28,-18,28]);break;
      case 'wheel': outline=ellipse(4,0,31,22);break;
      case 'spike': outline=polygon([-25,-22,41,0,-25,22]);break;
      default: outline=ellipse(2,0,25);
    }
    shapes.push(transform(outline,pose.x,pose.y,pose.angle,pose.scale));
  }
  return shapes;
}
export function blockOutline(shape:EnemyShape,size:number):Polygon {
  const r=size/2;
  if(shape==='orb')return ellipse(0,0,r);
  if(shape==='capsule')return Array.from({length:26},(_,i)=>{
    const right=i<13,angle=(right?-Math.PI/2:Math.PI/2)+(i%13)*Math.PI/12;
    return {x:(right?1:-1)*r*.38+Math.cos(angle)*r*.62,y:Math.sin(angle)*r*.62};
  });
  if(shape==='shard')return polygon([r,0,-r*.72,-r*.72,-r*.42,0,-r*.72,r*.72]);
  if(shape==='box'){
    const corner=r*.3,points:Polygon=[];
    for(const [x,y,start] of [[r-corner,r-corner,0],[-r+corner,r-corner,90],[-r+corner,-r+corner,180],[r-corner,-r+corner,270]])
      for(let i=0;i<=4;i++){const angle=(start+i*22.5)*Math.PI/180;points.push({x:x+Math.cos(angle)*corner,y:y+Math.sin(angle)*corner});}
    return points;
  }
  const sides=shape==='triangle'?3:shape==='pentagon'?5:shape==='octagon'?8:shape==='diamond'?4:6;
  return Array.from({length:sides},(_,i)=>({x:Math.cos(-Math.PI/2+i*Math.PI*2/sides)*r,y:Math.sin(-Math.PI/2+i*Math.PI*2/sides)*r}));
}
// Separating-axis test: return the smallest displacement that frees the tank.
function separation(a:Polygon,b:Polygon):Point|null {
  let depth=Infinity,normal={x:0,y:0};
  for(const points of [a,b])for(let i=0;i<points.length;i++){
    const p=points[i],q=points[(i+1)%points.length],length=Math.hypot(q.x-p.x,q.y-p.y);
    if(length===0)continue;
    const axis={x:-(q.y-p.y)/length,y:(q.x-p.x)/length};
    const pa=a.map(v=>v.x*axis.x+v.y*axis.y),pb=b.map(v=>v.x*axis.x+v.y*axis.y);
    const left=Math.max(...pb)-Math.min(...pa),right=Math.max(...pa)-Math.min(...pb);
    if(left<=0||right<=0)return null;
    const signed=left<right?left:-right;
    if(Math.abs(signed)<depth){depth=Math.abs(signed);normal={x:axis.x*signed,y:axis.y*signed};}
  }
  return normal;
}
function convexPieces(shape:Polygon):Polygon[] {
  return shape.length===4&&shape[2].x<0&&shape[0].x>0&&shape[0].y===0
    ? [[shape[0],shape[1],shape[2]],[shape[0],shape[2],shape[3]]] : [shape];
}
export function tankBlockContact(outline:Polygon[],x:number,y:number,rotation:number,block:Polygon,bx:number,by:number,blockRotation:number):Point|null {
  const targets=convexPieces(block).map(points=>transform(points,bx,by,blockRotation));
  let result:Point|null=null;
  for(const shape of outline.flatMap(convexPieces))for(const target of targets){const offset=separation(transform(shape,x,y,rotation),target);if(offset&&(!result||Math.hypot(offset.x,offset.y)>Math.hypot(result.x,result.y)))result=offset;}
  return result;
}

// Test a finite beam against the actual rotated outline, including concave shapes.
export function beamHitsOutline(x:number,y:number,angle:number,range:number,outline:Polygon,targetX:number,targetY:number,rotation:number):boolean {
  const c=Math.cos(angle),s=Math.sin(angle);
  const points=transform(outline,targetX,targetY,rotation).map(p=>({x:(p.x-x)*c+(p.y-y)*s,y:-(p.x-x)*s+(p.y-y)*c}));
  let inside=false;
  for(let i=0,j=points.length-1;i<points.length;j=i++){
    const a=points[j],b=points[i];
    if((a.y>0)!==(b.y>0)){
      const hit=a.x+(b.x-a.x)*(-a.y)/(b.y-a.y);
      if(hit>=0&&hit<=range)return true;
      if(hit<0)inside=!inside;
    }
    if(Math.abs(a.y)<1e-6&&a.x>=0&&a.x<=range)return true;
  }
  return inside;
}
