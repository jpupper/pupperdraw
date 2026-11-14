precision highp float;
precision mediump sampler2D;

varying vec2 vUv;
uniform sampler2D uTexture;
uniform float uK;      // fraccion que se descuenta en este pase (0 = no toca nada)

// AUTOCLEAN: la pintura se va hacia el negro sola. Se multiplica la densidad
// (color Y masa) por (1 - uK): al bajar la masa, el display la muestra como
// fondo negro y el relieve desaparece, igual que si se tapara con negro.
void main () {
  vec4 c = texture2D(uTexture, vUv);
  gl_FragColor = c * (1.0 - uK);
}
