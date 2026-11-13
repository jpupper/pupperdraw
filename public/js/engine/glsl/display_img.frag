    precision highp float;
    precision mediump sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform sampler2D uLightTexture;
    uniform sampler2D uMatTexture;      // MATERIAL IMAGE: textura de la pintura
    uniform sampler2D uRefrTexture;     // REFRACTION IMAGE: lo que refracta
    uniform bool isUseMaterial;
    uniform bool isUseRefraction;
    uniform float refrStrength;
    uniform vec2 texelSize;
    uniform vec3 mousePos;
    uniform float bumpHeight;
    uniform float aspectRatio;
    uniform float cursorWidth;
    uniform float camHeight;
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
          bmp = vec3(cnt-texture2D(uTexture, vUv+txs.xz).a, texture2D(uTexture, vUv+txs.zy).a-cnt,1.);
        }
        bmp.z -= bmp.x*bmp.x+bmp.y*bmp.y;
        if(bumpHeight>0.)
            bmp.z *= bumpHeight;
        bmp = normalize(bmp);
        vec2 toM = vec2(vUv.x, 1.-vUv.y)-vec2(0.5,0.5);
        toM.x *=aspectRatio;
        bmp.xy +=toM*camHeight;
        bmp = normalize(bmp);
        //vec3 cam = normalize(vec3(vec2(vUv.x*aspectRatio, 1.-vUv.y),0.)-vec3(0.5*aspectRatio,0.5,camHeight));
        //cam = reflect(cam, bmp);
        bmp.xy = vec2(0.5)+vec2(0.5)*bmp.xy;
        vec3 light = vec3(2.)*texture2D(uLightTexture, bmp.xy).rgb;
        col = col*min(vec3(1.),light) + max(vec3(0.),light-vec3(1.))*min(1.,alpha);

        // MATERIAL IMAGE: la pintura toma la materia del cuadro (color + grano)
        if(isUseMaterial){
          vec3 mat = texture2D(uMatTexture, vUv).rgb;
          float pl = dot(col, vec3(0.299,0.587,0.114));
          col = mix(col, mat*(0.32+1.55*pl), 0.88);
        }
        // REFRACTION IMAGE: la pintura actua de lente sobre el cuadro
        // (el encuadre es el del lienzo; el relieve lo deforma)
        if(isUseRefraction){
          vec2 ruv = clamp(vUv + bmp.xy*refrStrength*0.05, 0.001, 0.999);
          vec3 refr = texture2D(uRefrTexture, ruv).rgb;
          col = mix(col, refr*(0.45+0.75*min(1.,alpha)), 0.85);
        }

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
      if(isUseBg){
        vec2 bgUv = vec2(0.5) + (vUv - vec2(0.5))*bgFit;
        vec3 bg = texture2D(uBgTexture, bgUv).rgb;
        col = col + bg*(1.0 - min(1.0, alpha));
        alpha = 1.0;
      }
     gl_FragColor = vec4(col, alpha);
    }
