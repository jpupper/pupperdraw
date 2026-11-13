    precision highp float;
    precision mediump sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform sampler2D uLightTexture;
    uniform vec2 texelSize;
    uniform vec3 mousePos;
    uniform float bumpHeight;
    uniform float aspectRatio;
    uniform float sourceRatio;
    uniform float cursorWidth;
    uniform float camHeight;
    uniform bool isDither;
    uniform bool isShowCursor;

    float hsl(vec3 col){
      float cmax = max(col.r, max(col.g, col.b));
      float cmin = min(col.r, min(col.g, col.b));
      float l = (cmax + cmin) *0.5;


      if(cmax == cmin){
          return 0.;
      }else{
          float d = (cmax - cmin);
          if(cmax==col.r)
            return (col.g-col.b)/d + (col.g<col.b?6.:0.);
          if(cmax==col.g)
            return (col.b-col.r)/d + 2.;
          return (col.r-col.g)/d + 4.;
      }
    }

    void main () {
      vec3 txs = vec3(texelSize, 0.0);
      vec4 fullCol = texture2D(uTexture, vUv);
      vec3 col = fullCol.rgb;
      float alpha = fullCol.a;
      if(alpha>0.){
        vec3 bmp = vec3(0.,0.,1.);
        if(bumpHeight>0.){
          float cnt = alpha;
          bmp = vec3(cnt-texture2D(uTexture, vUv+txs.xz).a, texture2D(uTexture, vUv+txs.zy).a-cnt,1.);
        }
        bmp.z -= bmp.x*bmp.x+bmp.y*bmp.y;
        if(bumpHeight>0.)
            bmp.z *= bumpHeight;
        bmp = normalize(bmp);
        vec3 cam = normalize(vec3(vec2(vUv.x, 1.-vUv.y),0.)-vec3(0.5,0.5,camHeight));
        cam.x *=aspectRatio;
        cam = refract(cam, bmp,0.5+hsl(col)*0.08);//0.3+hsl(col)*0.167
        cam.x *=sourceRatio;
        cam.xy = vec2(0.5)+vec2(0.5)*cam.xy;
        vec3 light = vec3(2.)*texture2D(uLightTexture, cam.xy).rgb;
        col = col*min(vec3(1.),light) + max(vec3(0.),light-vec3(1.))*min(1.,alpha);

        if(isDither){
          if((col.r+col.g+col.b)>0.0){
            vec3 fcol=fract(col*255.0);
            col=floor(col*255.0)/255.0;
            float rndm =(fract(sin(dot(vUv*100.0 ,vec2(12.9898,78.233))) * 43758.5453));
            if(fcol.r>rndm)col.r +=0.00390625; 
            if(fcol.g>rndm)col.g +=0.00390625; 
            if(fcol.b>rndm)col.b +=0.00390625; 
            col = max(vec3(0.),col);
          }
        }
      }
      if(isShowCursor){
        vec2 cursorUV = vUv-mousePos.xy;
        cursorUV.x *=aspectRatio;
        float cursorRad = length(cursorUV)/mousePos.z;
        float cursor = 0.;
        if(cursorRad<1.0){
          cursor = 0.75*smoothstep(1.,cursorWidth,cursorRad)*smoothstep(cursorWidth,1.,cursorRad);
          alpha+=cursor;
          if((col.r+col.g+col.b)>0.85)
            col-=vec3(cursor);
          else
            col+=vec3(cursor);
        }
      }
     gl_FragColor = vec4(col, alpha);
    }
