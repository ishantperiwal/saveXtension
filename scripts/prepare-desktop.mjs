import './package-extension.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
const output = fileURLToPath(new URL('../desktop/assets/', import.meta.url));
await mkdir(output, { recursive: true });
function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, bytes) { const name = Buffer.from(type), size = Buffer.alloc(4), crc = Buffer.alloc(4); size.writeUInt32BE(bytes.length); crc.writeUInt32BE(crc32(Buffer.concat([name, bytes]))); return Buffer.concat([size, name, bytes, crc]); }
function png(size) {
  const bytes = Buffer.alloc((size * 4 + 1) * size), polygon = [[.35,.26],[.65,.26],[.65,.75],[.5,.64],[.35,.75]];
  const distance = (x,y,a,b) => { const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy))); return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy); };
  for (let y=0;y<size;y++) for(let x=0;x<size;x++) {
    let alpha=0,white=0;
    for(let sy=0;sy<2;sy++) for(let sx=0;sx<2;sx++) {
      const px=(x+(sx+.5)/2)/size,py=(y+(sy+.5)/2)/size,cx=Math.max(.28,Math.min(.72,px)),cy=Math.max(.28,Math.min(.72,py));
      if(Math.hypot(px-cx,py-cy)<.2) alpha++;
      if(polygon.some((a,i)=>distance(px,py,a,polygon[(i+1)%polygon.length])<.024))white++;
    }
    const i=y*(size*4+1)+x*4+1,t=white/4;
    bytes[i]=Math.round(183+(255-183)*t);bytes[i+1]=Math.round(65+(255-65)*t);bytes[i+2]=Math.round(39+(255-39)*t);bytes[i+3]=Math.round(alpha/4*255);
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(bytes)),chunk('IEND',Buffer.alloc(0))]);
}
const images = new Map([16,32,48,64,128,256,512,1024].map(size=>[size,png(size)]));
await writeFile(`${output}icon.png`, images.get(1024));
const iconSizes=[16,32,48,128,256], icoHeader=Buffer.alloc(6+16*iconSizes.length);icoHeader.writeUInt16LE(1,2);icoHeader.writeUInt16LE(iconSizes.length,4);
let offset=icoHeader.length;
iconSizes.forEach((size,i)=>{const at=6+16*i,bytes=images.get(size);icoHeader[at]=size===256?0:size;icoHeader[at+1]=icoHeader[at];icoHeader.writeUInt16LE(1,at+4);icoHeader.writeUInt16LE(32,at+6);icoHeader.writeUInt32LE(bytes.length,at+8);icoHeader.writeUInt32LE(offset,at+12);offset+=bytes.length;});
await writeFile(`${output}icon.ico`,Buffer.concat([icoHeader,...iconSizes.map(size=>images.get(size))]));
const types=[[16,'icp4'],[32,'icp5'],[64,'icp6'],[128,'ic07'],[256,'ic08'],[512,'ic09'],[1024,'ic10']];
const chunks=types.map(([size,type])=>{const bytes=images.get(size),header=Buffer.alloc(8);header.write(type);header.writeUInt32BE(bytes.length+8,4);return Buffer.concat([header,bytes]);});
const icnsHeader=Buffer.alloc(8);icnsHeader.write('icns');icnsHeader.writeUInt32BE(8+chunks.reduce((n,c)=>n+c.length,0),4);
await writeFile(`${output}icon.icns`,Buffer.concat([icnsHeader,...chunks]));
console.log('Desktop icons prepared.');
