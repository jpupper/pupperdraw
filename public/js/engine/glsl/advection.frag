    precision highp float;
    precision mediump sampler2D;

    varying vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 texelSize;
    uniform float texelSqr;
    uniform float smudge;
    uniform float dissipation;

    void main () {
        vec2 mvec = texture2D(uVelocity, vUv).xy * texelSize;

        vec2 coord = vUv - mvec;
        vec4 ocol = texture2D(uSource, coord);

        float mspeed = dot(mvec, mvec);
        if(smudge==0.0 || mspeed==0.)
          ocol *= dissipation;
        else{
            vec2 ocoord = coord;
            vec2 cosub = mvec*smudge;
            coord+=cosub;
            vec4 col = texture2D(uSource, coord);
            coord+=cosub;
            col += texture2D(uSource, coord);
            coord=ocoord;
            cosub = texture2D(uVelocity, coord).xy * texelSize*smudge;
            coord-=cosub;
            col += texture2D(uSource, coord);
            coord-=cosub;
            col += texture2D(uSource, coord)+ocol;

            ocol = mix(ocol, col*0.2, smudge);
        }
        gl_FragColor = ocol;
    }
