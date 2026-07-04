// ZzFX - Zuper Zmall Zeound Zynth - Micro Edition
// A tiny audio synthesizer for HTML5 games

const zzfxR = 44100;
let zzfxV = 0.3;
let zzfxX = new (window.AudioContext || (window as any).webkitAudioContext)();

export const zzfx = (...z: any[]) => {
  // @ts-ignore
  let b=[],e=0,f=0,g=0,c=1,d=0,h=0,i=0,j=1,k=0,l=0,m=0,n=0,o=0,p=0,q=0,r=0,s=0,t=0,u=0,v=0,w=0,x=0,y=zzfxX.createBuffer(1,1e5,zzfxR),A=zzfxX.createBufferSource();
  // @ts-ignore
  let p1=z[1]||.05,p2=z[2]||220,p3=z[3]||0,p4=z[4]||0,p5=z[5]||.1,p6=z[6]||0,p7=z[7]||1,p8=z[8]||0,p9=z[9]||0,p10=z[10]||0,p11=z[11]||0,p12=z[12]||0,p13=z[13]||0,p14=z[14]||0,p15=z[15]||0,p16=z[16]||0,p17=z[17]||0,p18=z[18]||1,p19=z[19]||0;
  
  for(let length=1e5; c<length; c++) {
    // @ts-ignore
    b[c]=0;
  }
  
  // @ts-ignore
  for (let length=99e3; e<length; e++) {
    // @ts-ignore
    f = e/zzfxR;
    g = f < p1 ? f/p1 : f < p1+p3 ? 1-(f-p1)/p3 : f < p1+p3+p5 ? 1-(f-p1-p3)/p5 : 0;
    // @ts-ignore
    h = p9 ? 1-p9*f : 1;
    // @ts-ignore
    i = p2 * h * Math.pow(2, p12*f) * (1 + p13*f) / zzfxR;
    // @ts-ignore
    j = 1 + p8 * f;
    // @ts-ignore
    k += p10 ? (Math.random()*2-1)*p10 : 0;
    // @ts-ignore
    l += p11 ? (Math.random()*2-1)*p11 : 0;
    // @ts-ignore
    m = p6 ? Math.sin(f*p6*2*Math.PI)*p7 : 0;
    
    // @ts-ignore
    n = Math.sin((d+k)*2*Math.PI + m) * g * zzfxV;
    
    // @ts-ignore
    b[e] = n * p18;
    // @ts-ignore
    d += i;
  }
  
  // @ts-ignore
  y.getChannelData(0).set(b);
  A.buffer = y;
  A.connect(zzfxX.destination);
  A.start();
};

export const AudioSettings = {
  sfxEnabled: true,
  dynamicGravity: true
};

export const AudioEngine = {
  playMove: () => {
    // Disabled movement sound as it is distracting during rapid sliding
  },
  playThud: () => {
    if (!AudioSettings.sfxEnabled) return;
    // Deep impact punch
    zzfx(1,0.01,80,0.03,0.1,0.3,1,1.5,0,0,0,0,0,0,0,0,0,1,0.02);
  },
  playChime: () => {
    if (!AudioSettings.sfxEnabled) return;
    // Bright neon sparkle
    zzfx(1,0.05,900,0.05,0.2,0.4,2,2,0,0,0,0.1,0,0,0,0,0,0.7,0.05);
  },
  playAlert: () => {
    if (!AudioSettings.sfxEnabled) return;
    // Multi-tone level up
    zzfx(1,0.1,400,0.1,0.4,0.6,1,3,0,0,0,0.2,0,0,0,0,0,0.8,0.1);
  }
};
