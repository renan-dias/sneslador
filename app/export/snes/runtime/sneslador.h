/*
 * Runtime Sneslador para SNES (PVSnesLib).
 * Implementa em C as mesmas funções que o live view do editor implementa em JavaScript.
 */
#ifndef SNESLADOR_H
#define SNESLADOR_H

#include <snes.h>
#include <string.h>
#include "gamedata.h"

/* ---- chamadas geradas pelo compilador de scripts (scripts.c) ---- */
void sl_game_boot(void);
void sl_scene_init(u16 scene);
void sl_scene_start(u16 scene);
void sl_scene_update(u16 scene);

/* ---- carregamento gerado (gamedata.c) ---- */
void sl_load_scene_data(u16 scene);


/* ---- estado usado pelo gamedata.c ao carregar uma cena ---- */
extern u8 *sl_ld_tiles;
extern u16 sl_ld_tiles_size;
extern u8 *sl_ld_map1;
extern u16 sl_ld_map1_w;
extern u8 *sl_ld_map2;
extern u8 *sl_ld_tilecell;
extern u8 *sl_ld_tileflags;
extern u16 sl_ld_ntiles;
extern u8 *sl_ld_celltile;
extern u16 sl_ld_ncells;
extern u16 sl_ld_bgcolor;
extern u16 sl_ld_bg1pal;
extern s16 sl_ld_parallax;


/* ---- API da linguagem SNS ---- */
s16 sl_btn(s16 b);
s16 sl_btnp(s16 b);
void sl_spr(s16 slot, s16 spr, s16 x, s16 y, s16 frame, s16 flags);
void sl_hide(s16 slot);
s16 sl_anim(s16 a);
s16 sl_animt(s16 a, s16 t);
void sl_scroll(s16 x, s16 y);
s16 sl_tile(s16 tx, s16 ty);
void sl_settile(s16 tx, s16 ty, s16 cell);
s16 sl_solid(s16 px, s16 py);
s16 sl_tiletag(s16 px, s16 py);
void sl_text(s16 x, s16 y, char *str);
void sl_num(s16 x, s16 y, s16 v);
void sl_cls(void);
void sl_go(s16 scene);
void sl_brightness(s16 level);
void sl_bgcolor(s16 r, s16 g, s16 b);
void sl_sfx(s16 snd);
void sl_music(s16 song);
void sl_stopmusic(void);
s16 sl_rnd(s16 n);
s16 sl_abs(s16 v);
s16 sl_min(s16 a, s16 b);
s16 sl_max(s16 a, s16 b);
s16 sl_overlap(s16 x1, s16 y1, s16 w1, s16 h1, s16 x2, s16 y2, s16 w2, s16 h2);
s16 sl_frames(void);

/* ---- aritmética com a mesma semântica do live view ---- */
s16 sl_div(s16 a, s16 b);
s16 sl_mod(s16 a, s16 b);
s16 sl_shl(s16 a, s16 b);
s16 sl_shr(s16 a, s16 b);
void sl_memclr(void *dst, u16 size);
void sl_memcpy(void *dst, const void *src, u16 size);

#endif
