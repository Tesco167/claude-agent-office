#!/usr/bin/env python3
# THROWAWAY (CLAUDE.md s7): 6 cute chars w/ distinct hair + outfits. Width-validated.
import zlib, struct

def hex2rgb(h):
    n=int(h[1:],16); return ((n>>16)&255,(n>>8)&255,n&255)
def shade(h,f):
    r,g,b=hex2rgb(h); return (min(255,round(r*f)),min(255,round(g*f)),min(255,round(b*f)))
def mul(rgb,f): return tuple(min(255,max(0,round(v*f))) for v in rgb)
def blend(a,b,t): return tuple(round(a[i]*(1-t)+b[i]*t) for i in range(3))

def color_map(body_hex,hair_hex,skin_hex):
    skin=hex2rgb(skin_hex); body=hex2rgb(body_hex); hair=hex2rgb(hair_hex)
    return {'s':skin,'h':hair,'b':body,'l':hex2rgb('#2a2a35'),'w':hex2rgb('#ffffff'),
            'c':hex2rgb('#ffd700'),'e':hex2rgb('#241405'),'z':hex2rgb('#4a3520'),
            'd':shade(skin_hex,0.84),'D':shade(skin_hex,0.70),'L':shade(skin_hex,1.12),
            'm':hex2rgb('#c47b6a'),'g':hex2rgb('#222222'),
            'G':hex2rgb('#9aa0a8'),'i':hex2rgb('#f7f7f7'),
            'H':shade(hair_hex,0.72),'k':shade(body_hex,0.66),'B':shade(body_hex,1.28),
            'p':hex2rgb('#5a5e63'),'P':hex2rgb('#c0c4c8'),
            'q':hex2rgb('#3a3d44'),'Q':hex2rgb('#56595f'),
            'r':hex2rgb('#a23b3b'),'R':hex2rgb('#c05a5a')}   # scarf maroon
FORM=set('shHbBkdDLlz'); HAIR=set('hH')
W=36; HEADH=26; cx=17.5

def skin_shade(g):
    # 4-tone skin ramp: L highlight, s base, d mid shadow, D deep shadow
    H=HEADH
    # deep contact shadow directly beneath hair / hat / beret
    for r in range(1,H):
        for c in range(W):
            if g[r][c]=='s' and g[r-1][c] in 'hHqQ': g[r][c]='D'
    # mid shadow beside the hair frame (cheeks)
    for r in range(H):
        for c in range(W):
            if g[r][c]=='s' and ((c>0 and g[r][c-1] in 'hH') or (c<W-1 and g[r][c+1] in 'hH')):
                g[r][c]='d'
    # jaw / chin: lowest two skin cells per column
    for c in range(W):
        rows=[r for r in range(H) if g[r][c] in 'sLdD']
        if rows:
            b=max(rows)
            for r in (b,b-1):
                if 0<=r<H and g[r][c]=='s': g[r][c]='d'
    # forehead + left-cheek highlight (light from top-left)
    for r in range(9,15):
        for c in range(12,21):
            if g[r][c]=='s' and (c-cx)<3 and g[r-1][c] not in 'hH':
                g[r][c]='L'
    # nose-bridge highlight
    for (nc,nr) in [(17,17),(17,18),(18,18)]:
        if 0<=nr<H and g[nr][nc]=='s': g[nr][nc]='L'
    return g

import math
HSTYLE={
 'short':    dict(fw=1, fb=11, cap_row=10),
 'sidepart': dict(fw=1, fb=13, cap_row=10, part=True),
 'long':     dict(fw=3, fb=25, cap_row=10, drape='long'),
 'spiky':    dict(fw=2, fb=16, cap_row=10, spikes=True),
 'wild':     dict(fw=3, fb=22, cap_row=11, bumpy=True, big=True),
 'wavy':     dict(fw=2, fb=22, cap_row=10, bumpy=True, drape='wavy'),
}
def build_hair(g, opt):
    """Fill hair ('h') around the already-stamped face skin per the hairstyle.
    Mutates g (a HEADH x W list-of-lists). Returns the style param dict P."""
    style=opt.get('hair','bob')
    P=HSTYLE.get(style, dict(fw=2, fb=18, cap_row=10))
    orx,ory,ocy = (14.6,13.8,12.2) if P.get('big') else (12.7,12.7,12.0)
    for r in range(HEADH):
        for c in range(W):
            if g[r][c]=='.' and r<=P['cap_row'] and ((c-cx)/orx)**2+((r-ocy)/ory)**2<=1.0:
                g[r][c]='h'
    def face_edges(r):
        cols=[c for c in range(W) if g[r][c]=='s']
        return (min(cols),max(cols)) if cols else None
    for r in range(P['cap_row'], P['fb']+1):
        ed=face_edges(r)
        if not ed: continue
        L,R=ed
        for k in range(1,P['fw']+1):
            if 0<=L-k<W and g[r][L-k]=='.': g[r][L-k]='h'
            if 0<=R+k<W and g[r][R+k]=='.': g[r][R+k]='h'
    def hair_top(c):
        for r in range(HEADH):
            if g[r][c]=='h': return r
        return None
    if P.get('spikes'):
        for c,up in [(8,2),(11,3),(14,2),(17,3),(20,2),(23,3),(26,2)]:
            t=hair_top(c)
            if t is not None:
                for k in range(1,up+1):
                    if t-k>=0: g[t-k][c]='h'
    if P.get('bumpy'):
        for c in range(5,31,2):
            t=hair_top(c)
            if t is not None and t-1>=0: g[t-1][c]='h'
        for r in range(8,P['fb'],2):
            ed=face_edges(r)
            if not ed: continue
            L,R=ed
            ll=L-P['fw']-1; rr=R+P['fw']+1
            if 0<=ll<W and g[r][ll]=='.': g[r][ll]='h'
            if 0<=rr<W and g[r][rr]=='.': g[r][rr]='h'
    if P.get('part'):
        for r in range(0,10):
            if g[r][13]=='h': g[r][13]='H'
    return P

def make_head(opt):
    g=[['.']*W for _ in range(HEADH)]
    fcy,frx,fry = 15.5, 11.0, 10.8
    for r in range(HEADH):
        for c in range(W):
            if r>=9 and ((c-cx)/frx)**2 + ((r-fcy)/fry)**2 <= 1.0: g[r][c]='s'
    P=build_hair(g, opt)
    orx,ory,ocy = (14.6,13.8,12.2) if P.get('big') else (12.7,12.7,12.0)
    # eyes
    def stamp_eye(ecx,ecy,big):
        ry=2.9 if big else 2.6; rx=3.0 if big else 2.7
        for dy in range(-4,4):
            for dx in range(-4,4):
                if (dx/rx)**2+(dy/ry)**2<=1.0:
                    rr,ccc=ecy+dy,ecx+dx
                    if 0<=rr<HEADH and 0<=ccc<W and g[rr][ccc]=='s': g[rr][ccc]='e'
        for (dx,dy) in [(-1,-2),(0,-2),(-1,-1),(0,-1)]:
            rr,ccc=ecy+dy,ecx+dx
            if 0<=rr<HEADH and 0<=ccc<W and g[rr][ccc]=='e': g[rr][ccc]='i'
        rr,ccc=ecy+1,ecx+1
        if 0<=rr<HEADH and 0<=ccc<W and g[rr][ccc]=='e': g[rr][ccc]='i'
    big=opt.get('eyes')=='big'
    stamp_eye(11,15,big); stamp_eye(24,15,big)
    if opt.get('glasses')=='round':
        for (ecx,ecy) in [(11,15),(24,15)]:
            for dy in range(-4,4):
                for dx in range(-4,4):
                    if abs((dx/3.5)**2+(dy/3.4)**2-1.0)<0.22:
                        rr,ccc=ecy+dy,ecx+dx
                        if 0<=rr<HEADH and 0<=ccc<W and g[rr][ccc] in 'se': g[rr][ccc]='G'
        for c in range(15,21):
            if g[15][c]=='s': g[15][c]='G'
    if opt.get('glasses')=='square':
        for (x0,x1) in [(7,15),(20,28)]:
            for x in range(x0,x1+1):
                for y in (12,18):
                    if g[y][x] in 'se': g[y][x]='G'
            for y in range(12,19):
                for x in (x0,x1):
                    if g[y][x] in 'se': g[y][x]='G'
        for c in range(15,21):
            if g[15][c]=='s': g[15][c]='G'
    if opt.get('freckles'):
        for (fx,fy) in [(8,18),(10,19),(25,19),(27,18),(9,17),(26,17)]:
            if 0<=fy<HEADH and g[fy][fx]=='s': g[fy][fx]='d'
    for bx in [8,9,25,26]:
        if g[19][bx]=='s': g[19][bx]='d'
    exp=opt.get('mouth','neutral')
    if exp=='smile':
        for c in range(15,21):
            if g[21][c]=='s': g[21][c]='m'
        for c in (14,21):
            if g[20][c]=='s': g[20][c]='m'
    elif exp=='grin':
        for c in range(15,21):
            if g[21][c]=='s': g[21][c]='m'
        for c in range(16,20):
            if g[22][c]=='s': g[22][c]='i'
    else:
        for c in range(16,20):
            if g[21][c]=='s': g[21][c]='m'
        if g[20][17]=='s': g[20][17]='m'
        if g[20][18]=='s': g[20][18]='m'
    if opt.get('mustache'):
        for c in range(13,23):
            if g[20][c]=='s': g[20][c]='e'
        for c in (13,22):
            if g[19][c]=='s': g[19][c]='e'
    if opt.get('goatee'):
        for c in range(16,20):
            if g[23][c]=='s': g[23][c]='e'
        if g[22][17]=='s': g[22][17]='e'
        if g[22][18]=='s': g[22][18]='e'
    if opt.get('headphones'):
        for c in range(5,31):
            x=(c-cx)/orx
            if abs(x)<=1.0:
                br=int(round(ocy-ory*math.sqrt(max(0.0,1-x*x))))+1
                for bb,col in ((br,'P'),(br+1,'p')):
                    if 0<=bb<HEADH and g[bb][c] in 'h.': g[bb][c]=col
        for ux in (4,31):
            for dy in range(-3,4):
                for dx in range(-2,3):
                    if (dx/2.2)**2+(dy/3.2)**2<=1.0:
                        rr,ccc=15+dy,ux+dx
                        if 0<=rr<HEADH and 0<=ccc<W: g[rr][ccc]='p'
            for dy in range(-2,3):
                if 0<=15+dy<HEADH: g[15+dy][ux]='G'
    if opt.get('beret'):
        for r in range(0,8):
            for c in range(W):
                if g[r][c]=='h': g[r][c]='q'
        for c in range(W):
            if g[3][c]=='q' and c<cx: g[3][c]='Q'
        for r in range(1,HEADH-1):
            for c in range(W):
                if g[r][c]=='q' and g[r+1][c]=='h': g[r+1][c]='g'
        g[0]=list('................bb..................')
    if opt.get('crown'):
        g[0]=list('...........c..c..c..c..c............')
        g[1]=list('...........ccccccccccccc............')
    skin_shade(g)
    return g

def make_body(outfit, hairstyle):
    g=[['.']*W for _ in range(9)]
    bounds={0:(12,23),1:(11,24),2:(10,25),3:(10,25),4:(10,25),5:(10,25),6:(10,25),7:(11,23),8:(12,23)}
    for r,(a,b) in bounds.items():
        for c in range(a,b+1): g[r][c]='b'
    for r in (3,4,5):                       # hands
        g[r][9]='s'; g[r][26]='s'
    # subtle body shading
    g[4][12]='k'; g[4][13]='k'; g[4][22]='B'; g[5][12]='k'; g[5][22]='B'
    # ---- outfit details ----
    if outfit=='robe':           # Jamesmie: gold-trim collar + medallion
        for c in range(12,24): g[0][c]='c'
        g[1][12]='c'; g[1][23]='c'
        g[3][17]='c'; g[3][18]='c'; g[4][17]='c'   # medallion
    elif outfit=='tie':          # Manager: white collar + tie
        for c in range(12,24): g[0][c]='w'
        g[1][15]='w'; g[1][16]='w'; g[1][19]='w'; g[1][20]='w'
        for r in range(1,7): g[r][17]='g'; g[r][18]='g'
        g[1][17]='w'; g[1][18]='w'
    elif outfit=='cardigan':     # Reader: collar + button placket
        for c in range(13,23): g[0][c]='w'
        for r in range(1,7):
            g[r][17]='k'; g[r][18]='k'
        for r in (2,4,6): g[r][17]='w'   # buttons
    elif outfit=='hoodie':       # Coder: hood + drawstrings
        for c in range(11,25): g[0][c]='k'
        for c in range(12,24): g[1][c]='k'
        g[1][14]='b'; g[1][21]='b'
        for r in (2,3,4): g[r][16]='w'; g[r][19]='w'   # drawstrings
        g[2][17]='k'; g[2][18]='k'
    elif outfit=='jacket':       # Searcher: open jacket + white tee
        for c in range(15,21):
            for r in range(0,7):
                if g[r][c]=='b': g[r][c]='w'
        for r in range(1,7): g[r][14]='k'; g[r][21]='k'   # lapels
        g[0][14]='k'; g[0][21]='k'
    elif outfit=='scarf':        # Writer: turtleneck + maroon scarf
        for c in range(12,24): g[0][c]='r'
        for c in range(11,25): g[1][c]='r'
        g[2][12]='R'; g[2][13]='r'; g[2][14]='r'        # hanging end
        for c in range(15,21): g[2][c]='r'
    # ---- long / wavy hair draping over shoulders ----
    if hairstyle=='long':
        for r in range(0,9):
            cols=(5,6,7,8,27,28,29,30) if r<6 else (5,6,7,28,29,30)
            for c in cols:
                if g[r][c]=='.': g[r][c]='h'
    elif hairstyle=='wavy':
        for r in range(0,5):
            for c in (6,7,28,29):
                if g[r][c]=='.': g[r][c]='h'
    return g

def make_back(opt):
    """Up/back view: full hair silhouette, no face. Keep crown/beret/headphones."""
    g=[['.']*W for _ in range(HEADH)]
    fcy,frx,fry = 15.5, 11.0, 10.8
    for r in range(HEADH):
        for c in range(W):
            if r>=9 and ((c-cx)/frx)**2+((r-fcy)/fry)**2<=1.0: g[r][c]='s'
    build_hair(g, opt)
    for r in range(HEADH):                 # back of head: skin area becomes hair
        for c in range(W):
            if g[r][c]=='s': g[r][c]='h'
    if opt.get('headphones'):
        orx,ory,ocy = 12.7,12.7,12.0
        for c in range(5,31):
            x=(c-cx)/orx
            if abs(x)<=1.0:
                br=int(round(ocy-ory*math.sqrt(max(0.0,1-x*x))))+1
                for bb,col in ((br,'P'),(br+1,'p')):
                    if 0<=bb<HEADH and g[bb][c] in 'h.': g[bb][c]=col
        for ux in (4,31):
            for dy in range(-3,4):
                for dx in range(-2,3):
                    if (dx/2.2)**2+(dy/3.2)**2<=1.0 and 0<=15+dy<HEADH: g[15+dy][ux]='p'
            for dy in range(-2,3):
                if 0<=15+dy<HEADH: g[15+dy][ux]='G'
    if opt.get('beret'):
        for r in range(0,8):
            for c in range(W):
                if g[r][c]=='h': g[r][c]='q'
        for c in range(W):
            if g[3][c]=='q' and c<cx: g[3][c]='Q'
        for r in range(1,HEADH-1):
            for c in range(W):
                if g[r][c]=='q' and g[r+1][c]=='h': g[r+1][c]='g'
        g[0]=list('................bb..................')
    if opt.get('crown'):
        g[0]=list('...........c..c..c..c..c............')
        g[1]=list('...........ccccccccccccc............')
    return g

def make_body_back(outfit, hairstyle):
    """Back of the torso: plain shirt + hood/scarf-from-behind + long-hair drape."""
    g=[['.']*W for _ in range(9)]
    bounds={0:(14,21),1:(13,22),2:(12,23),3:(12,23),4:(12,23),5:(12,23),6:(12,23),7:(13,22),8:(13,22)}
    for r,(a,b) in bounds.items():
        for c in range(a,b+1): g[r][c]='b'
    for r in (3,4,5): g[r][9]='s'; g[r][26]='s'
    g[4][12]='k'; g[5][12]='k'; g[4][22]='B'; g[5][22]='B'
    if outfit=='hoodie':
        for c in range(11,25): g[0][c]='k'
        for c in range(12,24): g[1][c]='k'
    elif outfit=='scarf':
        for c in range(12,24): g[0][c]='r'
        for c in range(11,25): g[1][c]='r'
    if hairstyle=='long':
        for r in range(0,9):
            cols=(5,6,7,8,27,28,29,30) if r<6 else (5,6,7,28,29,30)
            for c in cols:
                if g[r][c]=='.': g[r][c]='h'
    elif hairstyle=='wavy':
        for r in range(0,5):
            for c in (6,7,28,29):
                if g[r][c]=='.': g[r][c]='h'
    return g

LEGS_CUTE = {
 'stand':['............llll...llll.............','............llll...llll.............',
          '............zzzz...zzzz.............','............zzzzz.zzzzz.............'],
 'walk1':['.............lllll..ll..............','.............lllll..ll..............',
          '.............zzzzz..zz..............','..............zzzz.zzz..............'],
 'walk2':['.............ll..lllll..............','.............ll..lllll..............',
          '.............zz..zzzzz..............','..............zzz.zzzz..............'],
}

CFG=[
 ('Jamesmie','#fbbf24','#1a0a00','#f5d5a0',
   dict(crown=True,eyes='big',mouth='smile',hair='short'),'robe','short'),
 ('Manager', '#6366f1','#1a1a2e','#c68642',
   dict(glasses='square',mustache=True,hair='sidepart'),'tie','sidepart'),
 ('Reader',  '#3b82f6','#8b4513','#ffe0bd',
   dict(glasses='round',freckles=True,hair='long'),'cardigan','long'),
 ('Coder',   '#22c55e','#1a237e','#8d5524',
   dict(headphones=True,goatee=True,hair='spiky'),'hoodie','spiky'),
 ('Searcher','#f97316','#6b0f1a','#e0ac69',
   dict(eyes='big',hair='wild',mouth='grin'),'jacket','wild'),
 ('Writer',  '#14b8a6','#0f3a35','#d9b38c',
   dict(beret=True,glasses='round',goatee=True,hair='wavy'),'scarf','wavy'),
]
ALLOWED=set('.shHbBkdDLlzwcezmgGiPpqQrR')
def validate(grid,name):
    ok=True
    for i,row in enumerate(grid):
        if len(row)!=36: print(f'WIDTH {name} r{i}: {len(row)}'); ok=False
        bad=set(row)-ALLOWED
        if bad: print(f'CHAR {name} r{i}: {sorted(bad)}'); ok=False
    return ok

def assemble(name, opt, outfit, hairstyle):
    """Return (bd, bu) as joined 36-wide strings (head+torso, 35 rows each)."""
    bd=[''.join(r) for r in make_head(opt)+make_body(outfit,hairstyle)]
    bu=[''.join(r) for r in make_back(opt)+make_body_back(outfit,hairstyle)]
    for tag,grid in (('BD',bd),('BU',bu)):
        if not validate(grid, f'{name}.{tag}'): raise SystemExit('grid errors')
        assert len(grid)==35, f'{name}.{tag} height {len(grid)} != 35'
    return bd,bu

def all_frames_uniform():
    """Assert every assembled full frame (head+torso+each leg variant) is 39x36."""
    for name,bd,hr,sk,opt,outfit,hairstyle in CFG:
        b_d,b_u=assemble(name,opt,outfit,hairstyle)
        for top in (b_d,b_u):
            for lk in ('stand','walk1','walk2'):
                full=top+LEGS_CUTE[lk]
                assert len(full)==39, f'{name} {lk} height {len(full)}'
                for i,row in enumerate(full):
                    assert len(row)==36, f'{name} {lk} r{i} width {len(row)}'
    print('all frames uniform: 39x36')

def filled(grid,r,c): return 0<=r<len(grid) and 0<=c<W and grid[r][c]!='.'
def render_cells(grid,cmap,hi=1.18,lo=0.66,spec_t=0.55):
    out=[[None]*W for _ in range(len(grid))]; OUT=hex2rgb('#0a0a16')
    for r in range(len(grid)):
        for c in range(W):
            ch=grid[r][c]
            if ch=='.': continue
            col=cmap.get(ch,(255,0,255))
            if ch in FORM:
                t=((c/(W-1))+(r/(len(grid)-1)))/2; f=hi+(lo-hi)*t
                if (not filled(grid,r+1,c)) or (not filled(grid,r,c+1)): f*=0.80
                elif (not filled(grid,r-1,c)) or (not filled(grid,r,c-1)): f*=1.10
                col=mul(col,f)
            if ch in HAIR and r<len(grid)*0.34 and (W*0.18)<c<(W*0.58) and not filled(grid,r-1,c):
                col=blend(col,(255,255,255),spec_t)
            out[r][c]=col
    for r in range(len(grid)):
        for c in range(W):
            if grid[r][c]!='.': continue
            if any(filled(grid,r+dr,c+dc) for dr in(-1,0,1) for dc in(-1,0,1) if(dr or dc)):
                out[r][c]=OUT
    return out

SCALE=8; PAD=12; GAP=16; FLOOR=hex2rgb('#1e2a2e')
def build():
    grids=[]
    for name,bd,hr,sk,opt,outfit,hairstyle in CFG:
        head=make_head(opt); body=make_body(outfit,hairstyle)
        g=[''.join(r) for r in head+body] + LEGS_CUTE['stand']
        if not validate(g,name): raise SystemExit('grid errors')
        grids.append((g,bd,hr,sk))
    rH=max(len(g) for g,_,_,_ in grids)
    cellW=W*SCALE+PAD*2; cellH=rH*SCALE+PAD*2
    CW=len(grids)*cellW+(len(grids)+1)*GAP; CH=cellH+GAP*2
    canvas=[FLOOR]*(CW*CH)
    for ci,(g,bd,hr,sk) in enumerate(grids):
        cmap=color_map(bd,hr,sk); cells=render_cells(g,cmap)
        ox=GAP+ci*(cellW+GAP)+PAD; oy=GAP+PAD
        cxp=ox+(W*SCALE)//2; cyp=oy+len(g)*SCALE-SCALE
        rx=int(W*SCALE*0.30); ry=max(4,int(SCALE*1.3))
        for yy in range(cyp-ry,cyp+ry+1):
            for xx in range(cxp-rx,cxp+rx+1):
                if 0<=xx<CW and 0<=yy<CH:
                    dx=(xx-cxp)/rx; dy=(yy-cyp)/ry; dd=dx*dx+dy*dy
                    if dd<=1.0:
                        idx=yy*CW+xx; canvas[idx]=blend(canvas[idx],(0,0,0),0.55*(1-dd*dd))
        for r in range(len(g)):
            for c in range(W):
                col=cells[r][c]
                if col is None: continue
                for sy in range(SCALE):
                    for sx in range(SCALE):
                        canvas[(oy+r*SCALE+sy)*CW+(ox+c*SCALE+sx)]=col
    return canvas,CW,CH

def write_png(path,canvas,CW,CH):
    raw=bytearray()
    for y in range(CH):
        raw.append(0)
        for x in range(CW):
            r,g,b=canvas[y*CW+x]; raw+=bytes((r,g,b))
    def chunk(tag,data):
        return struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)
    with open(path,'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n'); f.write(chunk(b'IHDR',struct.pack('>IIBBBBB',CW,CH,8,2,0,0,0)))
        f.write(chunk(b'IDAT',zlib.compress(bytes(raw),9))); f.write(chunk(b'IEND',b''))
def build_back():
    grids=[]
    for name,bd,hr,sk,opt,outfit,hairstyle in CFG:
        head=make_back(opt); body=make_body_back(outfit,hairstyle)
        g=[''.join(r) for r in head+body] + LEGS_CUTE['stand']
        if not validate(g,name): raise SystemExit('grid errors (back)')
        grids.append((g,bd,hr,sk))
    rH=max(len(g) for g,_,_,_ in grids)
    cellW=W*SCALE+PAD*2; cellH=rH*SCALE+PAD*2
    CW=len(grids)*cellW+(len(grids)+1)*GAP; CH=cellH+GAP*2
    canvas=[FLOOR]*(CW*CH)
    for ci,(g,bd,hr,sk) in enumerate(grids):
        cmap=color_map(bd,hr,sk); cells=render_cells(g,cmap)
        ox=GAP+ci*(cellW+GAP)+PAD; oy=GAP+PAD
        cxp=ox+(W*SCALE)//2; cyp=oy+len(g)*SCALE-SCALE
        rx=int(W*SCALE*0.30); ry=max(4,int(SCALE*1.3))
        for yy in range(cyp-ry,cyp+ry+1):
            for xx in range(cxp-rx,cxp+rx+1):
                if 0<=xx<CW and 0<=yy<CH:
                    dx=(xx-cxp)/rx; dy=(yy-cyp)/ry; dd=dx*dx+dy*dy
                    if dd<=1.0:
                        idx=yy*CW+xx; canvas[idx]=blend(canvas[idx],(0,0,0),0.55*(1-dd*dd))
        for r in range(len(g)):
            for c in range(W):
                col=cells[r][c]
                if col is None: continue
                for sy in range(SCALE):
                    for sx in range(SCALE):
                        canvas[(oy+r*SCALE+sy)*CW+(ox+c*SCALE+sx)]=col
    return canvas,CW,CH

all_frames_uniform()
canvas,CW,CH=build(); write_png('__cute_preview.png',canvas,CW,CH)
print('wrote __cute_preview.png',CW,'x',CH,'-> Jamesmie Manager Reader Coder Searcher Writer')
cb,cbw,cbh=build_back(); write_png('__back_preview.png',cb,cbw,cbh)
print('wrote __back_preview.png')
