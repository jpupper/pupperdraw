    precision highp float;
    precision mediump sampler2D;

    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform vec2 texelSize;
    uniform vec3 mousePos;
    uniform float aspectRatio;
    uniform float cursorWidth;
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
     gl_FragColor = vec4(col, alpha);//*min(1.,alpha)+max(0.,1.0-alpha)*gl_FragColor.rgb
    }
