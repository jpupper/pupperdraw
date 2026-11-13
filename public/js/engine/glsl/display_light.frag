    precision highp float;
    precision mediump sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform vec2 texelSize;
    uniform vec3 lightDir; 
    uniform vec3 lightPos;
    uniform vec3 mousePos;
    uniform float aspectRatio;
    uniform float bumpHeight;
    uniform float cursorWidth;
    uniform float glossiness;

    uniform bool isDither;
    uniform bool isShowCursor;
    uniform sampler2D uBgTexture;       // VER IMAGEN: fondo de referencia
    uniform bool isUseBg;
    uniform vec2 bgFit;

    void main () {
      vec3 txs = vec3(texelSize, 0.0);
      vec4 fullCol = texture2D(uTexture, vUv);
      vec3 col = fullCol.rgb;
      float alpha = fullCol.a;
      if(alpha>0.){
        vec3 bmp = vec3(0.,0.,1.);
        if(bumpHeight>0.){
          float cnt = alpha;
          bmp = vec3(texture2D(uTexture, vUv+txs.xz).a-cnt, texture2D(uTexture, vUv+txs.zy).a-cnt,1.);
          bmp.z -= bmp.x*bmp.x+bmp.y*bmp.y;
          if(bmp.z>0.0) {
            if(bmp.z<1.0){
              bmp.z = sqrt(bmp.z)*bumpHeight;
              bmp = normalize(bmp);
            }
          }
          else
            bmp = vec3(normalize(bmp.xy),0.);
        }

        vec3 light = vec3(vUv,0.)-lightPos;
        light.y *=texelSize.x/texelSize.y;
        float ldist = length(light);
        light = normalize(light);
        float lit= max(0.,dot(light, bmp));
        vec3 scol = col*mix(vec3(1.0), vec3(0.5,0.2,0.0), 1.0-min(1.,10.*(-lightPos.z/ldist)));
        col = scol*lit; //+col*(1.0-dot(vec3(0.,0.,1.), bmp))*vec3(0.1,0.2,0.4);
        if(alpha>1. && glossiness>0.){
          float bri = 1.-length(col.rgb)*0.57735;
          float gloss = glossiness*min(1.,alpha-1.)*bri;
          vec3 cam = vec3(vec2(vUv.x, vUv.y)-vec2(0.5,0.5), 2.5);
          cam.x *=aspectRatio;
          cam = normalize(cam);

          vec3 refl = reflect(-cam, bmp);
          float spec = max(0.,dot(refl, light));
          col += gloss*pow(spec,glossiness*alpha*40.);
        }

        if(isDither){
          if((col.r+col.g+col.b)>0.0){
            vec3 mcol = col*255.0;
            vec3 fcol=fract(mcol);
            col=floor(mcol)/255.0;
            float rndm = fract(sin(dot(vUv*14.0 ,vec2(12.9898,78.233))) * 43758.5453);
            if(fcol.r>rndm)col.r +=0.0039216; 
            if(fcol.g>rndm)col.g +=0.0039216; 
            if(fcol.b>rndm)col.b +=0.0039216; 
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
          alpha+=cursor*4.;
          if((col.r+col.g+col.b)>0.85)
            col-=vec3(cursor);
          else
            col+=vec3(cursor);
        }
      }
      if(isUseBg){
        vec2 bgUv = vec2(0.5) + (vUv - vec2(0.5))*bgFit;
        vec3 bg = texture2D(uBgTexture, bgUv).rgb;
        col = col + bg*(1.0 - min(1.0, alpha));
        alpha = 1.0;
      }
     gl_FragColor = vec4(col, alpha);
    }
