import type { Part } from './config';

export type VectorArt = {
  type:'circle'|'ellipse'|'rect'|'polygon'|'line';
  x?:number;y?:number;r?:number;rx?:number;ry?:number;width?:number;height?:number;
  points?:number[];fill?:string;stroke?:string;strokeWidth?:number;opacity?:number;
};
export const INK='#29324a';
const METAL='#b9c9d5',LIGHT='#eff6f5',DARK='#172438';
const circle=(x:number,y:number,r:number,fill:string,stroke?:string,strokeWidth=1.5):VectorArt=>({type:'circle',x,y,r,fill,stroke,strokeWidth});
const rect=(x:number,y:number,width:number,height:number,fill:string,rx=3,stroke?:string,strokeWidth=1.5):VectorArt=>({type:'rect',x,y,width,height,rx,fill,stroke,strokeWidth});
const ellipse=(x:number,y:number,rx:number,ry:number,fill:string,stroke?:string,strokeWidth=1.5):VectorArt=>({type:'ellipse',x,y,rx,ry,fill,stroke,strokeWidth});
const poly=(points:number[],fill:string,stroke?:string,strokeWidth=1.5):VectorArt=>({type:'polygon',points,fill,stroke,strokeWidth});
const line=(points:number[],stroke:string,strokeWidth=2,opacity=1):VectorArt=>({type:'line',points,stroke,strokeWidth,opacity});
function arc(x:number,y:number,rx:number,ry:number,start:number,end:number,color:string,width=2,opacity=1):VectorArt {
  const points:number[]=[];
  for(let i=0;i<=20;i++){const angle=(start+(end-start)*i/20)*Math.PI/180;points.push(x+Math.cos(angle)*rx,y+Math.sin(angle)*ry);}
  return line(points,color,width,opacity);
}
const bolt=(x:number,y:number):VectorArt[]=>[circle(x,y,2.6,INK),circle(x-.3,y-.4,1.3,METAL)];

const moduleArtCache=new Map<string,VectorArt[]>();
export function moduleArt(part:Part):VectorArt[] {
  const cached=moduleArtCache.get(part.id);if(cached)return cached;
  const color=`#${part.color.toString(16).padStart(6,'0')}`,art:VectorArt[]=[];
  if(part.shape==='barrel'){
    const heavy=part.id==='bonker',h=heavy?34:26;
    art.push(rect(-10,-h/2,58,h,INK,7),rect(-6,-h/2+4,50,h-8,color,4));
    art.push(line([-1,-h/2+6,18,-h/2+6],LIGHT,2,.55),rect(21,-h/2+2,7,h-4,DARK,2));
    if(part.id==='flamethrower'){
      art.push(rect(-6,-10,23,20,DARK,4),rect(-3,-8,17,16,'#d65b32',3),line([-1,-5,11,-5], '#ffc96b',2),rect(16,-7,27,14,METAL,3),rect(32,-12,16,24,INK,3),rect(35,-8,10,16,'#ff982f',2),rect(39,-5,9,10,DARK,2),circle(43,0,3,'#ffe7a1'));
      for(const x of [20,26])art.push(line([x,-5,x,5],INK,2));
    }else if(part.id==='railgun'){
      art.push(rect(-4,-8,48,16,DARK,3),rect(4,-3,42,6,'#b9ffff',2),rect(2,-13,44,6,METAL,2),rect(2,7,44,6,METAL,2),rect(39,-12,9,24,INK,2),rect(42,-8,4,16,color,1));
      for(const x of [5,15,25])art.push(rect(x,-12,4,4,color,1),rect(x,8,4,4,color,1));
    }else if(part.id==='ricochet'){
      art.push(rect(31,-11,19,22,INK,3),rect(34,-8,13,16,METAL,2),poly([40.5,-5,45,0,40.5,5,36,0],DARK),line([-1,4,6,-4,10,2,17,-4],LIGHT,2));
    }else{
      art.push(circle(40,0,heavy?13:9,INK),circle(40,0,heavy?9.5:6.5,METAL),circle(41,0,heavy?6.5:4,DARK),arc(40,0,heavy?10:7,heavy?10:7,205,290,LIGHT,1.7));
      for(const x of [3,9,15])art.push(rect(x,heavy?5:3,3,heavy?6:4,INK,1));
    }
    art.push(...bolt(-1,0));
  }else if(part.shape==='pod'){
    art.push(poly([-15,-18,24,-18,46,0,24,18,-15,18],INK),poly([-11,-14,22,-14,39,0,22,14,-11,14],color));
    art.push(line([-7,-11,20,-11,30,-5],LIGHT,2,.5),rect(-12,-8,7,16,DARK,2));
    if(part.id==='sprinkler'){
      for(const [x,y] of [[24,-8],[32,0],[24,8]])art.push(circle(x,y,5.5,INK),circle(x+.5,y,3,METAL),circle(x+1,y,1.6,DARK));
      art.push(line([0,-5,8,0,0,5],LIGHT,2.5));
    }else if(part.id==='boomer'){
      art.push(poly([0,-5,10,-12,24,-6,13,-4,7,4,17,10,5,11,-4,3],LIGHT,INK,1.6),line([2,-4,10,-9,19,-6], '#ffd38a',2));
    }else if(part.id==='wiggler'){
      art.push(rect(-1,-9,29,18,DARK,4),line([2,1,6,-4,10,-4,15,5,19,5,24,-1], '#9cf9d0',2.5),circle(32,0,3,LIGHT));
    }else{
      art.push(line([2,0,13,0,23,-7],INK,2.5),line([13,0,23,7],INK,2.5),poly([2,-4,6,0,2,4,-2,0],LIGHT));
      for(const [x,y] of [[25,-7],[30,0],[25,7]])art.push(poly([x-3,y-3,x+3,y,x-3,y+3],LIGHT,INK,1));
    }
    art.push(...bolt(-8,-11),...bolt(-8,11));
  }else if(part.shape==='booster'){
    art.push(poly([-28,-19,11,-19,31,-10,31,10,11,19,-28,19],INK),poly([-24,-14,8,-14,24,-6,24,6,8,14,-24,14],color));
    art.push(line([-20,-11,6,-11],LIGHT,2,.55),rect(-21,-8,7,16,DARK,2),rect(20,-15,15,30,INK,4));
    if(part.id==='twin-booster'){
      for(const y of [-7,7])art.push(rect(-8,y-2,18,4,DARK,1.5),ellipse(28,y,4.5,5,METAL),ellipse(29,y,2.5,3,'#ffcc73'));
    }else{
      art.push(rect(-8,-8,20,16,DARK,3),poly([-3,-5,5,0,-3,5],LIGHT),ellipse(28,0,5,part.id==='micro-booster'?6:10,METAL),ellipse(29,0,3,part.id==='micro-booster'?3.5:6,'#ffcc73'));
    }
    art.push(...bolt(-20,-11),...bolt(-20,11));
  }else if(part.shape==='plate'){
    art.push(poly([-18,-28,17,-28,30,-20,38,-7,38,7,30,20,17,28,-18,28],INK),poly([-14,-23,15,-23,26,-16,33,-5,33,5,26,16,15,23,-14,23],color));
    art.push(line([-9,-20,12,-20,23,-13],LIGHT,2,.55));
    if(part.id==='bubble'){
      art.push(ellipse(8,0,16,18,INK),ellipse(8,0,12.5,14.5,'#a3f4d3'),arc(8,0,9,11,200,285,LIGHT,3),circle(13,6,3,'#58c995'));
    }else if(part.id==='brick'){
      art.push(rect(-6,-15,24,30,INK,4),rect(-3,-12,18,10,'#ffc3d4',2),rect(-3,2,18,10,'#cf527c',2),line([0,-9,12,-9],LIGHT,1.5,.6));
    }else{
      art.push(rect(-7,-16,25,32,DARK,7));
      for(const x of [-2,5,12])art.push(line([x,-10,x+3,-5,x,0,x+3,5,x,10], '#a8b8c5',2));
    }
    art.push(...bolt(-9,-17),...bolt(-9,17),...bolt(25,0));
  }else if(part.shape==='wheel'){
    art.push(ellipse(4,0,31,22,INK),ellipse(4,0,27,18,DARK),ellipse(4,0,22,14,color),arc(4,0,24,15,205,300,LIGHT,1.5,.4));
    if(part.id==='crawler'){
      for(const x of [-17,-7,3,13,23])art.push(line([x,-13,x+3,-9],METAL,3),line([x,13,x+3,9],METAL,3));
      for(const x of [-7,13])art.push(circle(x,0,7,INK),circle(x,0,4,METAL),circle(x,0,1.8,DARK));
    }else{
      for(const x of [-15,-5,5,15,23])art.push(line([x,-16,x+2,-12],METAL,2),line([x,16,x+2,12],METAL,2));
      art.push(circle(4,0,11,INK),circle(4,0,8,METAL),circle(4,0,3.5,DARK));
      for(const angle of [0,90,180,270])art.push(circle(4+Math.cos(angle*Math.PI/180)*5,Math.sin(angle*Math.PI/180)*5,1.3,LIGHT));
    }
  }else if(part.shape==='spike'){
    art.push(poly([-25,-22,41,0,-25,22],INK),poly([-20,-16,32,0,-20,16],color));
    if(part.id==='drill'){
      art.push(poly([-5,-11,37,0,-5,11],METAL,INK,1.5),poly([-5,-11,37,0,-5,0],LIGHT));
      for(const [x,w] of [[0,10],[10,7],[20,4]])art.push(line([x,-w,x+7,w*.65],INK,2));
      art.push(rect(-21,-10,13,20,DARK,3),line([-17,-6,-17,6],color,3));
    }else{
      art.push(poly([-8,-11,37,0,-8,11],METAL,INK,1.5),poly([-8,-11,37,0,-5,0],LIGHT),line([-17,-10,-13,0,-17,10],INK,3));
    }
    art.push(...bolt(-18,-13),...bolt(-18,13));
  }else{
    art.push(circle(2,0,25,INK),circle(2,0,21,METAL),circle(2,0,18,color),circle(2,0,14,DARK),arc(2,0,19,19,205,290,LIGHT,2,.65));
    if(part.id==='magnet'){
      art.push(line([-6,-7,-6,3,-4,7,8,7,10,3,10,-7],METAL,6),rect(-9,-10,6,7,'#ff8073',1),rect(7,-10,6,7,'#76d8ff',1),line([-5,-8,-5,-6],LIGHT,1.5),line([10,-8,10,-6],LIGHT,1.5));
    }else{
      for(let i=0;i<8;i++){const angle=i*Math.PI/4;art.push(line([2+Math.cos(angle)*8,Math.sin(angle)*8,2+Math.cos(angle)*11,Math.sin(angle)*11], '#ffce67',2));}
      art.push(circle(2,0,6.5,'#ffcc64'),circle(0,-2,3,LIGHT));
    }
    art.push(...bolt(-14,0),...bolt(18,0));
  }
  moduleArtCache.set(part.id,art);return art;
}

export function flameArt(part:Part):VectorArt[] {
  const ys=part.id==='twin-booster'?[-7,7]:[0],size=part.id==='micro-booster'?5:7;
  return ys.flatMap(y=>[poly([0,y-size,22,y,0,y+size,4,y], '#ff9c46'),poly([1,y-size*.55,15,y,1,y+size*.55], '#ffe0a0'),poly([2,y-2,9,y,2,y+2],LIGHT)]);
}

export function coreArt(color:string):VectorArt[] {
  const art:VectorArt[]=[circle(0,0,60,INK),circle(0,0,56,METAL),circle(0,0,52,color),arc(0,0,49,49,200,292,LIGHT,3,.45),arc(0,0,49,49,25,95,INK,3,.25),circle(0,0,39,INK),circle(0,0,35,'#71859a'),circle(0,0,31,METAL),circle(0,0,26,DARK),arc(0,0,23,23,200,300,'#607a98',2),line([-12,0,-4,9,14,-11],LIGHT,5)];
  for(let i=0;i<8;i++){const angle=(i*45+22.5)*Math.PI/180;art.push(...bolt(Math.cos(angle)*51,Math.sin(angle)*51));}
  art.push(poly([42,-5,48,0,42,5], '#ffe09a'),circle(-43,-8,2,LIGHT),circle(-43,0,2,'#9ff4c4'),circle(-43,8,2,INK));
  return art;
}
