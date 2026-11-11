'use strict';

const exhibitionThemes = {
  bob:{caption:'제자리에서 사뿐사뿐 떠올라요'},
  orbit:{caption:'서로 만나면 톡, 튕겨 나가요'},
  train:{caption:'오른쪽에서 왼쪽으로 차례차례 지나가요'},
  carousel:{caption:'작은 전시회를 빙글빙글 돌아요'}
};
let activeExhibition = null;
let exhibitionTime = 0;

function stopExhibitionScene() {
  if (activeExhibition) activeExhibition();
  activeExhibition = null;
}

// A shaded mesh curves the drawing around an upright egg. No remote 3D library is needed.
function createEggRenderer(canvas, items) {
  const gl = canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false});
  if (!gl) return null;
  const resources = [];
  function shader(type, source) {
    const value=gl.createShader(type); gl.shaderSource(value,source); gl.compileShader(value);
    if (!gl.getShaderParameter(value,gl.COMPILE_STATUS)) { gl.deleteShader(value); throw Error('3D shader unavailable'); }
    resources.push(()=>gl.deleteShader(value)); return value;
  }
  try {
    const program=gl.createProgram();
    gl.attachShader(program,shader(gl.VERTEX_SHADER,`
      attribute vec3 aPosition;
      attribute vec3 aNormal;
      attribute vec2 aUV;
      uniform vec2 uViewport;
      uniform vec2 uCenter;
      uniform float uSize;
      uniform float uYaw;
      varying vec3 vNormal;
      varying vec2 vUV;
      void main(){
        float c=cos(uYaw), s=sin(uYaw);
        mat3 rotation=mat3(c,0.,-s,0.,1.,0.,s,0.,c);
        vec3 p=rotation*aPosition;
        vec2 pixel=uCenter+vec2(p.x,-p.y)*uSize;
        gl_Position=vec4(pixel.x/uViewport.x*2.-1.,1.-pixel.y/uViewport.y*2.,-p.z*.2,1.);
        vNormal=rotation*aNormal;
        vUV=aUV;
      }`));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`
      precision mediump float;
      varying vec3 vNormal;
      varying vec2 vUV;
      uniform sampler2D uTexture;
      void main(){
        vec3 n=normalize(vNormal);
        vec3 light=normalize(vec3(-.55,.8,1.2));
        float diffuse=max(dot(n,light),0.);
        float highlight=pow(max(dot(reflect(-light,n),vec3(0.,0.,1.)),0.),28.)*.12;
        vec3 color=texture2D(uTexture,vUV).rgb;
        gl_FragColor=vec4(color*(.57+diffuse*.43)+highlight,1.);
      }`));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) {gl.deleteProgram(program); throw Error('3D program unavailable');}
    resources.push(()=>gl.deleteProgram(program));
    const vertices=[], indices=[], rings=28, segments=40;
    for(let row=0;row<=rings;row++) {
      const theta=row/rings*Math.PI, y=Math.cos(theta)*1.3;
      const radius=Math.sin(theta)*(1-.17*Math.cos(theta));
      for(let column=0;column<=segments;column++) {
        const phi=column/segments*Math.PI*2-Math.PI;
        const x=radius*Math.sin(phi), z=radius*Math.cos(phi);
        vertices.push(x,y,z,x,y/1.69,z,column/segments,row/rings);
      }
    }
    for(let row=0;row<rings;row++) for(let col=0;col<segments;col++) {
      const a=row*(segments+1)+col,b=a+segments+1;
      indices.push(a,b,a+1,b,b+1,a+1);
    }
    const vertexBuffer=gl.createBuffer(), indexBuffer=gl.createBuffer();
    resources.push(()=>gl.deleteBuffer(vertexBuffer),()=>gl.deleteBuffer(indexBuffer));
    gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
    gl.useProgram(program);
    for(const [name,size,offset] of [['aPosition',3,0],['aNormal',3,12],['aUV',2,24]]) {
      const location=gl.getAttribLocation(program,name);
      gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location,size,gl.FLOAT,false,32,offset);
    }
    const uniforms=Object.fromEntries(['uViewport','uCenter','uSize','uYaw','uTexture'].map(name=>[name,gl.getUniformLocation(program,name)]));
    let disposed=false;
    const textures=items.map(item=>{
      const texture=gl.createTexture();
      resources.push(()=>gl.deleteTexture(texture));
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([248,242,227,255]));
      const image=new Image();
      image.onload=()=>{
        if (disposed) return;
        const surface=document.createElement('canvas'); surface.width=1024; surface.height=512;
        const ctx=surface.getContext('2d');
        ctx.fillStyle='#fff9ed'; ctx.fillRect(0,0,1024,512);
        ctx.drawImage(image,296,40,432,432);
        gl.bindTexture(gl.TEXTURE_2D,texture);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,surface);
      };
      image.src=item.img;
      return texture;
    });
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    return {
      draw(width,height,positions,time) {
        if (disposed) return;
        const ratio=Math.min(window.devicePixelRatio||1,2);
        const pixelWidth=Math.round(width*ratio),pixelHeight=Math.round(height*ratio);
        if(canvas.width!==pixelWidth || canvas.height!==pixelHeight) {canvas.width=pixelWidth;canvas.height=pixelHeight;}
        gl.viewport(0,0,pixelWidth,pixelHeight);
        gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        gl.useProgram(program); gl.uniform2f(uniforms.uViewport,width,height); gl.uniform1i(uniforms.uTexture,0);
        positions.forEach((position,i)=>{
          gl.bindTexture(gl.TEXTURE_2D,textures[i]);
          gl.uniform2f(uniforms.uCenter,position.x,position.y);
          gl.uniform1f(uniforms.uSize,position.size/2);
          gl.uniform1f(uniforms.uYaw,Math.sin(time*.55+i)*.17);
          gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
        });
      },
      dispose() {disposed=true;resources.forEach(remove=>remove());gl.getExtension('WEBGL_lose_context')?.loseContext();}
    };
  } catch (error) {
    console.warn('3D egg rendering unavailable:',error.message);
    resources.forEach(remove=>remove());
    return null;
  }
}

function startExhibitionScene(gallery, items) {
  if (!gallery) return;
  const theme=motion;
  gallery.classList.add('exhibition-gallery');
  const eggs=gallery.querySelector('.eggs');
  gallery.insertAdjacentHTML('beforeend','<div class="exhibition-stage" role="region" aria-label="그림을 입힌 3D 계란 전시"><div class="scene-decor" aria-hidden="true"></div><canvas class="egg-canvas" aria-hidden="true"></canvas></div><div class="stage-caption"><span>✦ '+exhibitionThemes[theme].caption+'</span><small>'+ (room.mode==='random'?'친구 얼굴 전시회':'우리 반 그림 전시회')+'</small></div><p class="connection-note">'+(demo?'체험은 저장되지 않아요':'교사 화면을 열어두면 친구들과 연결돼요.')+'</p>');
  const stage=gallery.querySelector('.exhibition-stage');
  stage.append(eggs);
  const buttons=[...eggs.querySelectorAll('.egg')];
  const selectedId=room.quiz?.id || items.filter(item=>!item.revealed)[selected]?.id;
  buttons.forEach((button,i)=>{
    button.dataset.act='select-work';
    button.setAttribute('aria-label',(items[i].revealed?items[i].answer:artwork(i))+' 선택');
    button.classList.toggle('selected',items[i].id===selectedId);
  });
  if(!items.length) return;
  const canvas=stage.querySelector('.egg-canvas');
  const renderer=createEggRenderer(canvas,items);
  stage.classList.toggle('has-webgl',!!renderer);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let frame, last=performance.now(), width=0, height=0, baseSize=88, particles=[];
  const positions=[];
  function resize() {
    const oldWidth=width||1,oldHeight=height||1;
    width=stage.clientWidth; height=stage.clientHeight;
    const columns=Math.min(items.length,width<450?3:items.length<=6?3:Math.ceil(Math.sqrt(items.length*1.5)));
    const rows=Math.ceil(items.length/columns);
    if(items.length>12 && (theme==='bob'||theme==='orbit')) {
      const targetHeight=Math.max(innerWidth<=740?370:440,rows*105);
      if(stage.style.height!==targetHeight+'px') {stage.style.height=targetHeight+'px';height=targetHeight;}
    }
    baseSize=Math.min(90,(width-36)/columns*.65,(height-40)/rows*.47);
    if(theme==='train')baseSize=Math.min(96,width*.21);
    if(theme==='carousel')baseSize=Math.min(90,width*.15,Math.PI*width*.55/items.length);
    baseSize=Math.max(28,baseSize);
    if(particles.length) {
      particles.forEach(p=>{p.x=p.x/oldWidth*width;p.y=p.y/oldHeight*height;});
    } else {
      particles=items.map((item,i)=>({x:(i%columns+.5)*width/columns,y:(Math.floor(i/columns)+.5)*height/rows,vx:Math.cos(i*2.4+.5)*28,vy:Math.sin(i*2.4+.5)*24}));
    }
  }
  const observer=new ResizeObserver(resize); observer.observe(stage); resize();
  function bounce(dt) {
    const xMargin=baseSize*.58+8,yMargin=baseSize*.78+20,radius=baseSize*.66;
    for(const p of particles) {
      p.x+=p.vx*dt;p.y+=p.vy*dt;
      if(p.x<xMargin){p.x=xMargin;p.vx=Math.abs(p.vx);}
      if(p.x>width-xMargin){p.x=width-xMargin;p.vx=-Math.abs(p.vx);}
      if(p.y<yMargin){p.y=yMargin;p.vy=Math.abs(p.vy);}
      if(p.y>height-yMargin){p.y=height-yMargin;p.vy=-Math.abs(p.vy);}
    }
    for(let i=0;i<particles.length;i++) for(let j=i+1;j<particles.length;j++) {
      const a=particles[i],b=particles[j],dx=b.x-a.x,dy=b.y-a.y;
      const distance=Math.hypot(dx,dy);
      if(distance>=radius*2 || distance<.001)continue;
      const nx=dx/distance,ny=dy/distance,overlap=(radius*2-distance)/2;
      a.x-=nx*overlap;a.y-=ny*overlap;b.x+=nx*overlap;b.y+=ny*overlap;
      const impulse=(a.vx-b.vx)*nx+(a.vy-b.vy)*ny;
      if(impulse>0){a.vx-=impulse*nx;a.vy-=impulse*ny;b.vx+=impulse*nx;b.vy+=impulse*ny;}
    }
  }
  function tick(now) {
    if (!stage.isConnected) return;
    const dt=Math.min((now-last)/1000,.045);last=now;
    const moving=!paused&&!reduced.matches&&!document.hidden;
    if(moving) exhibitionTime+=dt*speed;
    if(theme==='orbit'&&moving)bounce(dt*speed);
    items.forEach((item,i)=>{
      let x,y,size=baseSize;
      if(theme==='orbit') {x=particles[i].x;y=particles[i].y;}
      else if(theme==='train') {
        const gap=Math.max(132,baseSize*1.65),length=Math.max(width+gap,items.length*gap);
        x=((i*gap-exhibitionTime*45)%length+length)%length-gap/2;
        y=height*.46+Math.sin(exhibitionTime*1.4+i)*4;
      } else if(theme==='carousel') {
        const angle=i/items.length*Math.PI*2+exhibitionTime*.22;
        x=width*.5+Math.sin(angle)*width*.35;
        y=height*.47+Math.cos(angle)*height*.23;
      } else {
        const columns=width<450?Math.min(3,items.length):items.length<=6?Math.min(3,items.length):Math.ceil(Math.sqrt(items.length*1.5));
        const row=Math.floor(i/columns),rowCount=Math.ceil(items.length/columns);
        const count=Math.min(columns,items.length-row*columns);
        x=width*.5+(i%columns-(count-1)/2)*width/columns;
        y=(row+.5)*height/rowCount+Math.sin(exhibitionTime*1.6+i*.9)*7;
      }
      positions[i]={x,y,size};
      const button=buttons[i];
      button.style.width=size+'px';
      button.style.height=(size*1.3+36)+'px';
      button.style.transform='translate('+(x-size/2)+'px,'+(y-size*.65)+'px)';
      button.style.zIndex=String(Math.round(y));
      button.style.setProperty('--egg-size',size+'px');
    });
    if(renderer)renderer.draw(width,height,positions,exhibitionTime);
    frame=requestAnimationFrame(tick);
  }
  frame=requestAnimationFrame(tick);
  activeExhibition=()=>{cancelAnimationFrame(frame);observer.disconnect();renderer?.dispose();};
}
