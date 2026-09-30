/*
 * Runtime Sneslador para SNES — loop principal, VBlank e API dos scripts.
 *
 * Mapa da VRAM (endereços em palavras de 16 bits):
 *   $0000  tiles 4bpp do cenário (BG1 e BG2)   até 1024 tiles
 *   $4000  fonte 2bpp do texto (BG3)
 *   $4800  mapa do BG1 (64x32)
 *   $5000  mapa do BG2 (32x32)
 *   $5800  mapa do BG3 / texto (32x32)
 *   $6000  tiles 4bpp dos sprites (OBJ)          até 512 tiles
 */
#include "sneslador.h"

#define VRAM_BGTILES  0x0000
#define VRAM_FONT     0x4000
#define VRAM_BG1MAP   0x4800
#define VRAM_BG2MAP   0x5000
#define VRAM_BG3MAP   0x5800
#define VRAM_OBJ      0x6000

#define NO_SCENE 0xFFFF
#define VBLANK_BUDGET 3072 /* bytes por VBlank para mapas/texto (sobra tempo para a OAM) */

extern char sl_objtiles, sl_objtiles_end;
extern char sl_palettes;
extern char sl_font, sl_font_end;
#if SL_HAS_AUDIO
extern char SOUNDBANK__;
#endif

/* dados da cena atual (preenchidos por sl_load_scene_data) */
u8 *sl_ld_tiles;
u16 sl_ld_tiles_size;
u8 *sl_ld_map1;
u16 sl_ld_map1_w;
u8 *sl_ld_map2;
u8 *sl_ld_tilecell;
u8 *sl_ld_tileflags;
u16 sl_ld_ntiles;
u8 *sl_ld_celltile;
u16 sl_ld_ncells;
u16 sl_ld_bgcolor;
u16 sl_ld_bg1pal;
s16 sl_ld_parallax;

/* cópias em RAM (WRAM) */
u16 sl_map1[2048];
u16 sl_textmap[1024];
s16 sl_tilecell[1024];
u8 sl_tileflags[1024];
u16 sl_celltile[1024];

u8 sl_textrow[32];
u8 sl_textdirty;
u8 sl_maprow[32];
u8 sl_mapdirty;

u16 sl_scene;
u16 sl_next_scene;
u16 sl_frame;
s16 sl_scrollx, sl_scrolly;
u8 sl_bright, sl_bright_applied;
u16 sl_backdrop;
u8 sl_backdrop_dirty;
u8 sl_has_bg2;

/* fila de transferências preparada no loop principal e executada no VBlank */
u16 sl_q_text_row, sl_q_text_bytes;
u16 sl_q_map_row, sl_q_map_bytes;
s16 sl_q_sx, sl_q_sy, sl_q_bx, sl_q_by;

static const u16 sl_btnmask[12] = {
    KEY_UP, KEY_DOWN, KEY_LEFT, KEY_RIGHT, KEY_A, KEY_B, KEY_X, KEY_Y, KEY_L, KEY_R, KEY_START, KEY_SELECT};

/* ------------------------------------------------------------------ */
/* VBlank: única hora em que a VRAM pode ser escrita com a tela ligada  */
/* ------------------------------------------------------------------ */
void sl_vblank(void)
{
    /* Precisa ser curto: o VBlank dura ~2200 ciclos de CPU e a PVSnesLib ainda
       copia a OAM. Por isso o trabalho pesado é feito antes, em sl_prepare_vblank(). */
    if (!vblank_flag)
        return; /* quadro atrasado (lag): o loop ainda está calculando */

    if (sl_q_text_bytes)
    {
        dmaCopyVram((u8 *)&sl_textmap[sl_q_text_row << 5], VRAM_BG3MAP + (sl_q_text_row << 5), sl_q_text_bytes);
        sl_q_text_bytes = 0;
    }
    if (sl_q_map_bytes)
    {
        dmaCopyVram((u8 *)&sl_map1[sl_q_map_row << 5], VRAM_BG1MAP + (sl_q_map_row << 5), sl_q_map_bytes);
        if (sl_ld_map1_w == 64)
            dmaCopyVram((u8 *)&sl_map1[0x400 + (sl_q_map_row << 5)], VRAM_BG1MAP + 0x400 + (sl_q_map_row << 5), sl_q_map_bytes);
        sl_q_map_bytes = 0;
    }
    if (sl_backdrop_dirty)
    {
        sl_backdrop_dirty = 0;
        setPaletteColor(0, sl_backdrop);
    }
    bgSetScroll(0, sl_q_sx, sl_q_sy);
    if (sl_has_bg2)
        bgSetScroll(1, sl_q_bx, sl_q_by);
}

/* Junta as linhas alteradas em blocos contíguos (1 DMA para o texto, 1 ou 2 para o mapa). */
static void sl_prepare_vblank(void)
{
    u16 r, lo, hi, budget, per;

    budget = VBLANK_BUDGET;
    if (sl_textdirty)
    {
        lo = 32;
        hi = 0;
        for (r = 0; r < 32; r++)
        {
            if (sl_textrow[r])
            {
                if (lo == 32)
                    lo = r;
                hi = r;
                sl_textrow[r] = 0;
            }
        }
        sl_textdirty = 0;
        if (lo < 32)
        {
            sl_q_text_row = lo;
            sl_q_text_bytes = (hi - lo + 1) << 6;
            budget -= sl_q_text_bytes;
        }
    }
    if (sl_mapdirty)
    {
        per = (sl_ld_map1_w == 64) ? 128 : 64;
        lo = 32;
        hi = 0;
        sl_mapdirty = 0;
        for (r = 0; r < 32; r++)
        {
            if (sl_maprow[r])
            {
                if (lo == 32)
                    lo = r;
                if ((r - lo + 1) * per > budget)
                {
                    sl_mapdirty = 1; /* o resto vai no próximo VBlank */
                    break;
                }
                hi = r;
                sl_maprow[r] = 0;
            }
        }
        if (lo < 32)
        {
            sl_q_map_row = lo;
            sl_q_map_bytes = (hi - lo + 1) << 6;
        }
    }
    sl_q_sx = sl_scrollx;
    sl_q_sy = sl_scrolly;
    if (sl_has_bg2)
    {
        sl_q_bx = (sl_scrollx * sl_ld_parallax) >> 3;
        sl_q_by = (sl_scrolly * sl_ld_parallax) >> 3;
    }
}

/* ------------------------------------------------------------------ */
/* Aritmética: igual ao live view (divisão trunca em direção ao zero)  */
/* ------------------------------------------------------------------ */
s16 sl_div(s16 a, s16 b)
{
    u16 ua, ub, q;
    u8 neg;
    if (b == 0)
        return 0;
    neg = 0;
    if (a < 0) { ua = (u16)(-a); neg ^= 1; } else ua = (u16)a;
    if (b < 0) { ub = (u16)(-b); neg ^= 1; } else ub = (u16)b;
    q = ua / ub;
    if (neg)
        return -(s16)q;
    return (s16)q;
}

s16 sl_mod(s16 a, s16 b)
{
    u16 ua, ub, r;
    if (b == 0)
        return 0;
    ua = (a < 0) ? (u16)(-a) : (u16)a;
    ub = (b < 0) ? (u16)(-b) : (u16)b;
    r = ua % ub;
    if (a < 0)
        return -(s16)r;
    return (s16)r;
}

s16 sl_shl(s16 a, s16 b)
{
    if (b < 0 || b > 15)
        return 0;
    return (s16)((u16)a << b);
}

s16 sl_shr(s16 a, s16 b)
{
    if (b < 0 || b > 15)
        return (a < 0) ? -1 : 0;
    if (a < 0)
        return (s16)(~((u16)(~a) >> b));
    return a >> b;
}

void sl_memclr(void *dst, u16 size)
{
    memset(dst, 0, size);
}

void sl_memcpy(void *dst, const void *src, u16 size)
{
    memcpy(dst, (void *)src, size);
}

/* ------------------------------------------------------------------ */
/* Controle                                                            */
/* ------------------------------------------------------------------ */
s16 sl_btn(s16 b)
{
    if ((u16)b > 11)
        return 0;
    return (padsCurrent(0) & sl_btnmask[b]) ? 1 : 0;
}

s16 sl_btnp(s16 b)
{
    if ((u16)b > 11)
        return 0;
    return (padsDown(0) & sl_btnmask[b]) ? 1 : 0;
}

/* ------------------------------------------------------------------ */
/* Sprites (OAM: 128 entradas)                                         */
/* ------------------------------------------------------------------ */
void sl_spr(s16 slot, s16 spr, s16 x, s16 y, s16 frame, s16 flags)
{
    u16 id, cnt, tile;
    u8 *hi;
    u8 bit;
    if ((u16)slot > 127 || (u16)spr >= SL_SPRITE_COUNT)
        return;
    cnt = sl_spr_count[spr];
    if (frame < 0)
        frame = 0;
    tile = sl_frame_tile[sl_spr_first[spr] + ((u16)frame % cnt)];
    id = (u16)slot << 2;
    oamSet(id, (u16)x & 0x1FF, (u16)y & 0xFF, 2, flags & 1, (flags >> 1) & 1, tile, sl_spr_pal[spr]);
    oamSetEx(id, sl_spr_large[spr] ? OBJ_LARGE : OBJ_SMALL, OBJ_SHOW);
    /* 9º bit de X fica na tabela alta da OAM: permite x negativo (sprite saindo pela esquerda) */
    hi = &oamMemory[512 + (slot >> 2)];
    bit = 1 << ((slot & 3) << 1);
    if (x & 0x100)
        *hi |= bit;
    else
        *hi &= ~bit;
}

void sl_hide(s16 slot)
{
    if ((u16)slot > 127)
        return;
    oamSetVisible((u16)slot << 2, OBJ_HIDE);
}

static void sl_hide_all(void)
{
    u16 i;
    for (i = 0; i < 128; i++)
        oamSetVisible(i << 2, OBJ_HIDE);
}

s16 sl_animt(s16 a, s16 t)
{
    u16 idx, len;
    if ((u16)a >= SL_ANIM_COUNT)
        return 0;
    if (t < 0)
        t = 0;
    len = sl_anim_len[a];
    idx = (u16)t / sl_anim_speed[a];
    if (sl_anim_loop[a])
        idx = idx % len;
    else if (idx >= len)
        idx = len - 1;
    return sl_anim_frames[sl_anim_first[a] + idx];
}

s16 sl_anim(s16 a)
{
    return sl_animt(a, (s16)(sl_frame & 0x7FFF));
}

/* ------------------------------------------------------------------ */
/* Cenário (BG1)                                                       */
/* ------------------------------------------------------------------ */
static u16 sl_mapaddr(u16 tx, u16 ty)
{
    return ((tx & 32) ? 0x400 : 0) + (ty << 5) + (tx & 31);
}

void sl_scroll(s16 x, s16 y)
{
    sl_scrollx = x;
    sl_scrolly = y;
}

s16 sl_tile(s16 tx, s16 ty)
{
    u16 e;
    if (tx < 0 || ty < 0 || tx >= (s16)sl_ld_map1_w || ty >= 32)
        return -1;
    e = sl_map1[sl_mapaddr(tx, ty)] & 0x3FF;
    if (e == 0 || e >= sl_ld_ntiles)
        return -1;
    return sl_tilecell[e];
}

void sl_settile(s16 tx, s16 ty, s16 cell)
{
    u16 v;
    if (tx < 0 || ty < 0 || tx >= (s16)sl_ld_map1_w || ty >= 32)
        return;
    if (cell < 0 || (u16)cell >= sl_ld_ncells)
        v = 0;
    else
    {
        v = sl_celltile[cell];
        if (v)
            v |= (sl_ld_bg1pal << 10);
    }
    sl_map1[sl_mapaddr(tx, ty)] = v;
    sl_maprow[ty] = 1;
    sl_mapdirty = 1;
}

static u8 sl_flags_at(s16 px, s16 py)
{
    u16 e;
    if (px < 0 || py < 0)
        return 0;
    px >>= 3;
    py >>= 3;
    if (px >= (s16)sl_ld_map1_w || py >= 32)
        return 0;
    e = sl_map1[sl_mapaddr(px, py)] & 0x3FF;
    if (e >= sl_ld_ntiles)
        return 0;
    return sl_tileflags[e];
}

s16 sl_solid(s16 px, s16 py)
{
    return (sl_flags_at(px, py) & 0x80) ? 1 : 0;
}

s16 sl_tiletag(s16 px, s16 py)
{
    return sl_flags_at(px, py) & 15;
}

/* ------------------------------------------------------------------ */
/* Texto (BG3)                                                         */
/* ------------------------------------------------------------------ */
void sl_text(s16 x, s16 y, char *str)
{
    u16 base;
    u8 c;
    if (y < 0 || y > 27)
        return;
    base = (u16)y << 5;
    while ((c = (u8)*str) != 0)
    {
        if (x >= 0 && x < 32)
        {
            if (c < 32 || c > 126)
                c = '?';
            sl_textmap[base + x] = (c == 32) ? 0 : ((u16)(c - 32) | 0x2000);
        }
        x++;
        str++;
    }
    sl_textrow[y] = 1;
    sl_textdirty = 1;
}

void sl_num(s16 x, s16 y, s16 v)
{
    char buf[8];
    u16 u;
    s16 i;
    i = 7;
    buf[i] = 0;
    if (v < 0)
        u = (u16)(-v);
    else
        u = (u16)v;
    do
    {
        buf[--i] = '0' + (u % 10);
        u /= 10;
    } while (u && i > 1);
    if (v < 0)
        buf[--i] = '-';
    sl_text(x, y, &buf[i]);
}

void sl_cls(void)
{
    u16 r;
    memset(sl_textmap, 0, sizeof(sl_textmap));
    for (r = 0; r < 32; r++)
        sl_textrow[r] = 1;
    sl_textdirty = 1;
}

/* ------------------------------------------------------------------ */
/* Tela, cenas e som                                                   */
/* ------------------------------------------------------------------ */
void sl_go(s16 scene)
{
    if ((u16)scene < SL_SCENE_COUNT)
        sl_next_scene = scene;
}

void sl_brightness(s16 level)
{
    if (level < 0)
        level = 0;
    if (level > 15)
        level = 15;
    sl_bright = level;
}

void sl_bgcolor(s16 r, s16 g, s16 b)
{
    sl_backdrop = (r & 31) | ((g & 31) << 5) | ((b & 31) << 10);
    sl_backdrop_dirty = 1;
}

/* Som: driver snesmod. Módulo 0 = efeitos; módulos 1.. = músicas. */
s16 sl_cur_song = -1;

#if SL_HAS_AUDIO
static void sl_load_effects(void)
{
    u16 j;
    for (j = 0; j < SL_SOUND_COUNT; j++)
        spcLoadEffect(j);
}
#endif

void sl_sfx(s16 snd)
{
#if SL_SOUND_COUNT > 0
    if ((u16)snd < SL_SOUND_COUNT)
        spcEffect(SL_SFX_PITCH, snd, 15 * 16 + 8); /* volume 15, panorama no centro */
#endif
}

void sl_music(s16 song)
{
#if SL_SONG_COUNT > 0
    if ((u16)song >= SL_SONG_COUNT || song == sl_cur_song)
        return;
    sl_cur_song = song;
    spcStop();
    spcLoad(1 + song); /* envia a música para a RAM do SPC700 (demora alguns quadros) */
    sl_load_effects();
    spcPlay(0);
#endif
}

void sl_stopmusic(void)
{
#if SL_HAS_AUDIO
    if (sl_cur_song >= 0)
        spcStop();
#endif
    sl_cur_song = -1;
}

s16 sl_rnd(s16 n)
{
    if (n <= 0)
        return 0;
    return (s16)(rand() % (u16)n);
}

s16 sl_abs(s16 v) { return v < 0 ? -v : v; }
s16 sl_min(s16 a, s16 b) { return a < b ? a : b; }
s16 sl_max(s16 a, s16 b) { return a > b ? a : b; }

s16 sl_overlap(s16 x1, s16 y1, s16 w1, s16 h1, s16 x2, s16 y2, s16 w2, s16 h2)
{
    return (x1 < x2 + w2 && x2 < x1 + w1 && y1 < y2 + h2 && y2 < y1 + h1) ? 1 : 0;
}

s16 sl_frames(void) { return (s16)sl_frame; }

static void sl_wait_frames(u16 n)
{
    while (n--)
    {
        sl_prepare_vblank();
#if SL_HAS_AUDIO
        spcProcess();
#endif
        WaitForVBlank();
    }
}

/* fade de entrada até `target`, ou de saída a partir do brilho atual (6 passos, igual ao live view) */
static void sl_fade(u8 in, s16 target)
{
    s16 i, v, from;
    from = sl_bright_applied;
    for (i = 0; i <= 15; i += 3)
    {
        if (in)
            v = (i < target) ? i : target;
        else
            v = ((15 - i) < from) ? (15 - i) : from;
        setBrightness(v);
        sl_wait_frames(1);
    }
    v = in ? target : 0;
    setBrightness(v);
    sl_bright = sl_bright_applied = v;
}

static void sl_change_scene(void)
{
    u16 r;
    s16 target;

    if (sl_scene != NO_SCENE)
        sl_fade(0, 0);
    setScreenOff();

    sl_scene = sl_next_scene;
    sl_next_scene = NO_SCENE;

    sl_hide_all();
    memset(sl_textmap, 0, sizeof(sl_textmap));
    memset(sl_textrow, 0, sizeof(sl_textrow));
    memset(sl_maprow, 0, sizeof(sl_maprow));
    sl_textdirty = 0;
    sl_mapdirty = 0;
    sl_q_text_bytes = sl_q_map_bytes = 0;
    sl_scrollx = sl_scrolly = 0;

    sl_ld_map2 = 0;
    sl_load_scene_data(sl_scene);

    /* tiles e mapas com a tela desligada (forced blank): DMA livre */
    dmaCopyVram(sl_ld_tiles, VRAM_BGTILES, sl_ld_tiles_size);
    sl_ld_map1_w = sl_ld_map1_w == 64 ? 64 : 32;
    memcpy(sl_map1, sl_ld_map1, sl_ld_map1_w == 64 ? 4096 : 2048);
    memcpy(sl_tilecell, sl_ld_tilecell, sl_ld_ntiles << 1);
    memcpy(sl_tileflags, sl_ld_tileflags, sl_ld_ntiles);
    if (sl_ld_ncells)
        memcpy(sl_celltile, sl_ld_celltile, sl_ld_ncells << 1);
    bgSetMapPtr(0, VRAM_BG1MAP, sl_ld_map1_w == 64 ? SC_64x32 : SC_32x32);
    dmaCopyVram((u8 *)sl_map1, VRAM_BG1MAP, sl_ld_map1_w == 64 ? 4096 : 2048);
    if (sl_ld_map2)
    {
        dmaCopyVram(sl_ld_map2, VRAM_BG2MAP, 2048);
        bgSetEnable(1);
        sl_has_bg2 = 1;
    }
    else
    {
        bgSetDisable(1);
        sl_has_bg2 = 0;
    }
    sl_backdrop = sl_ld_bgcolor;
    setPaletteColor(0, sl_backdrop);
    sl_backdrop_dirty = 0;

    sl_frame = 0;
    sl_bright = 15;
    sl_scene_init(sl_scene);
    sl_scene_start(sl_scene);

    /* o que o start() escreveu vai direto para a VRAM */
    dmaCopyVram((u8 *)sl_textmap, VRAM_BG3MAP, 2048);
    dmaCopyVram((u8 *)sl_map1, VRAM_BG1MAP, sl_ld_map1_w == 64 ? 4096 : 2048);
    for (r = 0; r < 32; r++)
        sl_textrow[r] = sl_maprow[r] = 0;
    sl_textdirty = sl_mapdirty = 0;
    sl_prepare_vblank();
    sl_q_text_bytes = sl_q_map_bytes = 0;
    bgSetScroll(0, sl_q_sx, sl_q_sy);
    if (sl_has_bg2)
        bgSetScroll(1, sl_q_bx, sl_q_by);

    target = sl_bright; /* o start() pode ter pedido outro brilho (ex.: 0 para um fade manual) */
    setBrightness(0);
    sl_bright_applied = 0;
    setScreenOn();
    sl_fade(1, target);
}

int main(void)
{
    /* A WRAM do SNES liga com lixo (emuladores usam $55): zere tudo que o runtime usa. */
    memset(sl_map1, 0, sizeof(sl_map1));
    memset(sl_textmap, 0, sizeof(sl_textmap));
    memset(sl_textrow, 0, sizeof(sl_textrow));
    memset(sl_maprow, 0, sizeof(sl_maprow));
    sl_textdirty = sl_mapdirty = sl_backdrop_dirty = sl_has_bg2 = 0;
    sl_q_text_bytes = sl_q_map_bytes = 0;
    sl_scrollx = sl_scrolly = sl_q_sx = sl_q_sy = sl_q_bx = sl_q_by = 0;
    sl_frame = 0;
    sl_ld_map1_w = 32;
    /* o estado do controle também começa com lixo: sem isso o START parece apertado no 1º quadro */
    memset(pad_keys, 0, sizeof(pad_keys));
    memset(pad_keysold, 0, sizeof(pad_keysold));
    memset(pad_keysdown, 0, sizeof(pad_keysdown));
    sl_ld_parallax = 0;

    sl_cur_song = -1;
#if SL_HAS_AUDIO
    spcBoot();
    spcSetBank(&SOUNDBANK__);
    spcStop();
    spcLoad(0);
    sl_load_effects();
#endif

    setMode(BG_MODE1, BG3_MODE1_PRIORITY_HIGH);
    bgSetGfxPtr(0, VRAM_BGTILES);
    bgSetGfxPtr(1, VRAM_BGTILES);
    bgSetGfxPtr(2, VRAM_FONT);
    bgSetMapPtr(0, VRAM_BG1MAP, SC_64x32);
    bgSetMapPtr(1, VRAM_BG2MAP, SC_32x32);
    bgSetMapPtr(2, VRAM_BG3MAP, SC_32x32);
    bgSetDisable(3);

    dmaCopyCGram((u8 *)&sl_palettes, 0, 512);
    dmaCopyVram((u8 *)&sl_font, VRAM_FONT, (&sl_font_end - &sl_font));
    dmaCopyVram((u8 *)&sl_objtiles, VRAM_OBJ, (&sl_objtiles_end - &sl_objtiles));
    oamInitGfxAttr(VRAM_OBJ, SL_OBJSIZE);


    sl_scene = NO_SCENE;
    sl_next_scene = SL_START_SCENE;
    sl_bright = sl_bright_applied = 15;
    srand(0x5A5A);

    nmiSet(sl_vblank);
    sl_game_boot();

    while (1)
    {
        if (sl_next_scene != NO_SCENE)
            sl_change_scene();

        sl_scene_update(sl_scene);
        sl_frame++;

        if (sl_bright != sl_bright_applied)
        {
            sl_bright_applied = sl_bright;
            setBrightness(sl_bright);
        }

#if SL_HAS_AUDIO
        spcProcess();
#endif
        sl_prepare_vblank();
        WaitForVBlank();
    }
    return 0;
}
