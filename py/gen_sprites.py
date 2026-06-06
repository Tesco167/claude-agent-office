#!/usr/bin/env python3
# THROWAWAY (CLAUDE.md s7): 6 cute chars w/ distinct hair + outfits. Width-validated.
import zlib, struct, sys

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
            'H':shade(hair_hex,0.62),'x':shade(hair_hex,0.42),'j':blend(hair,(255,255,255),0.17),'k':shade(body_hex,0.66),'B':shade(body_hex,1.30),'n':shade(body_hex,0.45),
            'p':hex2rgb('#5a5e63'),'P':hex2rgb('#c0c4c8'),
            'q':hex2rgb('#3a3d44'),'Q':hex2rgb('#56595f'),
            'r':hex2rgb('#a23b3b'),'R':hex2rgb('#c05a5a')}   # scarf maroon
FORM=set('sdDLlz'); HAIR=set('hHjx')   # hair+body tones flat; volume comes from shade_hair / shade_body
SZ = 2                      # resolution multiplier vs the original 36-wide art
W=36*SZ; HEADH=26*SZ; cx=(W-1)/2

def skin_shade(g):
    # 4-tone skin ramp: L highlight, s base, d mid shadow, D deep shadow
    H=HEADH
    # deep contact shadow directly beneath hair / hat / beret
    for r in range(1,H):
        for c in range(W):
            if g[r][c]=='s' and g[r-1][c] in 'hHqQ': g[r][c]='d'   # soft contact (was deep 'D' -> hard line)
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
    for r in range(9*SZ,15*SZ):
        for c in range(12*SZ,21*SZ):
            if g[r][c]=='s' and (c-cx)<3*SZ and g[r-1][c] not in 'hH':
                g[r][c]='L'
    # nose-bridge highlight
    for (nc,nr) in [(17*SZ,17*SZ),(17*SZ,18*SZ),(18*SZ,18*SZ)]:
        if 0<=nr<H and g[nr][nc]=='s': g[nr][nc]='L'
    return g

import math
HSTYLE={
 'short':    dict(fw=1*SZ, fb=11*SZ, cap_row=10*SZ),
 'sidepart': dict(fw=1*SZ, fb=13*SZ, cap_row=10*SZ, part=True),
 'long':     dict(fw=3*SZ, fb=25*SZ, cap_row=10*SZ, drape='long'),
 'spiky':    dict(fw=2*SZ, fb=16*SZ, cap_row=10*SZ, spikes=True),
 'wild':     dict(fw=3*SZ, fb=22*SZ, cap_row=11*SZ, bumpy=True, big=True),
 'wavy':     dict(fw=2*SZ, fb=22*SZ, cap_row=10*SZ, bumpy=True, drape='wavy'),
}
def build_hair(g, opt):
    """Fill hair ('h') around the already-stamped face skin per the hairstyle.
    Mutates g (a HEADH x W list-of-lists). Returns the style param dict P."""
    style=opt.get('hair','bob')
    P=HSTYLE.get(style, dict(fw=2*SZ, fb=18*SZ, cap_row=10*SZ))
    orx,ory,ocy = (14.6*SZ,13.8*SZ,12.2*SZ) if P.get('big') else (12.7*SZ,12.7*SZ,12.0*SZ)
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
        for c,up in [(8*SZ,2*SZ),(11*SZ,3*SZ),(14*SZ,2*SZ),(17*SZ,3*SZ),(20*SZ,2*SZ),(23*SZ,3*SZ),(26*SZ,2*SZ)]:
            t=hair_top(c)
            if t is not None:
                for k in range(1,up+1):
                    if t-k>=0: g[t-k][c]='h'
    if P.get('bumpy'):
        for c in range(5*SZ,31*SZ,2):
            t=hair_top(c)
            if t is not None and t-1>=0: g[t-1][c]='h'
        for r in range(8*SZ,P['fb'],2):
            ed=face_edges(r)
            if not ed: continue
            L,R=ed
            ll=L-P['fw']-1; rr=R+P['fw']+1
            if 0<=ll<W and g[r][ll]=='.': g[r][ll]='h'
            if 0<=rr<W and g[r][rr]=='.': g[r][rr]='h'
    if P.get('part'):
        for r in range(0,10*SZ):
            if g[r][13*SZ]=='h': g[r][13*SZ]='H'
    return P

def fringe(g, style):
    """Shape the FRONT hairline over the forehead per style, so each character's
    bangs differ instead of all sharing one flat horizontal cut. Brings hair ('h')
    down into the skin forehead (rows 11..b) by a per-style depth profile b(c).
    Runs before eyes/glasses are stamped (those sit at row >=15, below the fringe)."""
    def face_cols(r):
        cs=[c for c in range(W) if g[r][c]=='s']
        return (min(cs),max(cs)) if cs else None
    ed=face_cols(12*SZ)
    if not ed: return
    L,R=ed; span=max(1,R-L); mid=(L+R)/2.0; half=max(1.0,span/2.0)
    for c in range(L,R+1):
        dx=c-mid
        if   style=='sidepart': b=10*SZ+round((c-L)/span*4*SZ)            # swept across to one side
        elif style=='long':     b=10*SZ+round(abs(dx)/half*3*SZ)          # center-part curtains
        elif style=='spiky':    b=13*SZ if (c-L)%(3*SZ)==1 else 10*SZ     # jagged downward points
        elif style=='wild':     b=10*SZ+((c*5+c//2)%4)*SZ                 # uneven messy fringe
        elif style=='wavy':     b=10*SZ+round((1.5+1.5*math.sin((c-L)*0.8/SZ))*SZ)  # soft waves
        else:                   b=10*SZ+round((1-(dx/half)**2)*SZ)        # short: gentle rounded arc
        b=max(10*SZ,min(13*SZ,b))
        for r in range(11*SZ,b+1):
            if 0<=r<HEADH and g[r][c]=='s': g[r][c]='h'

def shade_hair(g, style='bob'):
    """Volumetric hair shading: treat the head-hair mass as a sphere and ramp it
    over 4 tones (j/h/H/x) by the surface normal (light from upper-left-front),
    modulated by lock ridges that fan from the crown so it reads as 3D locks, not
    a flat blob. Lock count / part offset / ridge depth vary per hairstyle so each
    style flows the way its shape implies. Mutates g (list-of-lists).
    Head dome = rows < HEADH; over-shoulder drape = rows >= HEADH."""
    rows=len(g)
    head=[(r,c) for r in range(min(HEADH,rows)) for c in range(W) if g[r][c]=='h']
    if head:
        rr=[r for r,_ in head]; cc=[c for _,c in head]
        r0,r1,c0,c1=min(rr),max(rr),min(cc),max(cc)
        cxh=(c0+c1)/2.0; cyh=(r0+r1)/2.0
        rx=max(1.0,(c1-c0)/2.0+0.5); ry=max(1.0,(r1-r0)/2.0+0.5)
        Lx,Ly,Lz=-0.42,-0.55,0.72
        # per-style: (lock count, crown x-offset = part side, ridge weight)
        SP={'spiky':(8.5,0.0,0.46),'wild':(7.5,0.0,0.44),'long':(5.5,0.0,0.34),
            'wavy':(5.0,0.0,0.36),'sidepart':(6.0,-2.4,0.42),'short':(6.5,0.0,0.40)}
        nlocks,cdx,rw=SP.get(style,(6.5,0.0,0.40))
        crown_r=r0-0.6; crownc=cxh+cdx*SZ
        for (r,c) in head:
            nx=(c-cxh)/rx; ny=(r-cyh)/ry
            v=1.0-nx*nx-ny*ny; nz=math.sqrt(v) if v>0 else 0.0
            d=nx*Lx+ny*Ly+nz*Lz                  # round volume (light upper-left-front)
            ang=math.atan2(r-crown_r, c-crownc)  # locks fan from crown (offset = part side)
            ridge=math.cos(ang*nlocks)           # +1 lock crest, -1 valley/seam
            s=(1.0-rw)*d+rw*ridge                # volume modulated by lock ridges
            g[r][c]=('j' if s>=0.80 else 'h' if s>=0.12 else 'H' if s>=-0.45 else 'x')
        # fringe tips that meet the face catch light — lift them out of deep shadow
        # so the hairline doesn't read as a hard dark stripe across the forehead.
        SKIN=set('sdDL')
        for (r,c) in head:
            if r+1<rows and g[r+1][c] in SKIN and g[r][c] in ('H','x'): g[r][c]='h'
    drape=[(r,c) for r in range(min(HEADH,rows),rows) for c in range(W) if g[r][c]=='h']
    if drape:                                    # over-shoulder locks: top-lit + vertical ridges
        rr=[r for r,_ in drape]; cc=[c for _,c in drape]
        r0=min(rr); r1=max(rr); cxd=(min(cc)+max(cc))/2.0
        for (r,c) in drape:
            tt=(r-r0)/max(1,(r1-r0))
            ridge=math.cos(((c-cxd)/(2.4*SZ))*math.pi)
            s=(0.62-tt*1.1)+0.34*ridge
            g[r][c]=('j' if s>=0.66 else 'h' if s>=-0.02 else 'H' if s>=-0.55 else 'x')

def shade_body(g):
    """Cel-shade the torso ('b' shirt cells) as a rounded volume lit from the
    left-front into 4 tones B/b/k/n, so clothing reads 3D in the same language as
    the hair. Outfit-detail cells (collar/tie/etc.) keep their own flat colors."""
    cells=[(r,c) for r in range(len(g)) for c in range(W) if g[r][c]=='b']
    if not cells: return
    rr=[r for r,_ in cells]; cc=[c for _,c in cells]
    r0,r1,c0,c1=min(rr),max(rr),min(cc),max(cc)
    cxb=(c0+c1)/2.0; rxb=max(1.0,(c1-c0)/2.0+0.5)
    for (r,c) in cells:
        nx=(c-cxb)/rxb
        nz=math.sqrt(max(0.0,1.0-nx*nx))
        d=nx*(-0.6)+nz*0.78-((r-r0)/max(1,(r1-r0)))*0.16   # cylinder + slight bottom falloff
        g[r][c]=('B' if d>=0.74 else 'b' if d>=0.30 else 'k' if d>=-0.10 else 'n')

def make_head(opt):
    g=[['.']*W for _ in range(HEADH)]
    fcy,frx,fry = 15.5*SZ, 11.0*SZ, 10.8*SZ
    for r in range(HEADH):
        for c in range(W):
            if r>=9*SZ and ((c-cx)/frx)**2 + ((r-fcy)/fry)**2 <= 1.0: g[r][c]='s'
    P=build_hair(g, opt)
    fringe(g, opt.get('hair','bob'))
    orx,ory,ocy = (14.6*SZ,13.8*SZ,12.2*SZ) if P.get('big') else (12.7*SZ,12.7*SZ,12.0*SZ)
    # eyes
    def stamp_eye(ecx,ecy,big):
        ry=2.9*SZ if big else 2.6*SZ; rx=3.0*SZ if big else 2.7*SZ
        for dy in range(-4*SZ,4*SZ):
            for dx in range(-4*SZ,4*SZ):
                if (dx/rx)**2+(dy/ry)**2<=1.0:
                    rr,ccc=ecy+dy,ecx+dx
                    if 0<=rr<HEADH and 0<=ccc<W and g[rr][ccc]=='s': g[rr][ccc]='e'
        for (dx,dy) in [(-1*SZ,-2*SZ),(0,-2*SZ),(-1*SZ,-1*SZ),(0,-1*SZ)]:
            rr,ccc=ecy+dy,ecx+dx
            if 0<=rr<HEADH and 0<=ccc<W and g[rr][ccc]=='e': g[rr][ccc]='i'
        rr,ccc=ecy+1*SZ,ecx+1*SZ
        if 0<=rr<HEADH and 0<=ccc<W and g[rr][ccc]=='e': g[rr][ccc]='i'
    big=opt.get('eyes')=='big'
    stamp_eye(11*SZ,15*SZ,big); stamp_eye(24*SZ,15*SZ,big)
    if opt.get('glasses')=='round':
        for (ecx,ecy) in [(11*SZ,15*SZ),(24*SZ,15*SZ)]:
            for dy in range(-4*SZ,4*SZ):
                for dx in range(-4*SZ,4*SZ):
                    if abs((dx/(3.5*SZ))**2+(dy/(3.4*SZ))**2-1.0)<0.22:
                        rr,ccc=ecy+dy,ecx+dx
                        if 0<=rr<HEADH and 0<=ccc<W and g[rr][ccc] in 'se': g[rr][ccc]='G'
        for c in range(15*SZ,21*SZ):
            if g[15*SZ][c]=='s': g[15*SZ][c]='G'
    if opt.get('glasses')=='square':
        for (x0,x1) in [(7*SZ,15*SZ),(20*SZ,28*SZ)]:
            for x in range(x0,x1+1):
                for y in (12*SZ,18*SZ):
                    if g[y][x] in 'se': g[y][x]='G'
            for y in range(12*SZ,19*SZ):
                for x in (x0,x1):
                    if g[y][x] in 'se': g[y][x]='G'
        for c in range(15*SZ,21*SZ):
            if g[15*SZ][c]=='s': g[15*SZ][c]='G'
    if opt.get('freckles'):
        for (fx,fy) in [(8*SZ,18*SZ),(10*SZ,19*SZ),(25*SZ,19*SZ),(27*SZ,18*SZ),(9*SZ,17*SZ),(26*SZ,17*SZ)]:
            if 0<=fy<HEADH and g[fy][fx]=='s': g[fy][fx]='d'
    for bx in [8*SZ,9*SZ,25*SZ,26*SZ]:
        if g[19*SZ][bx]=='s': g[19*SZ][bx]='d'
    exp=opt.get('mouth','neutral')
    if exp=='smile':
        for c in range(15*SZ,21*SZ):
            if g[21*SZ][c]=='s': g[21*SZ][c]='m'
        for c in (14*SZ,21*SZ):
            if g[20*SZ][c]=='s': g[20*SZ][c]='m'
    elif exp=='grin':
        for c in range(15*SZ,21*SZ):
            if g[21*SZ][c]=='s': g[21*SZ][c]='m'
        for c in range(16*SZ,20*SZ):
            if g[22*SZ][c]=='s': g[22*SZ][c]='i'
    else:
        for c in range(16*SZ,20*SZ):
            if g[21*SZ][c]=='s': g[21*SZ][c]='m'
        if g[20*SZ][17*SZ]=='s': g[20*SZ][17*SZ]='m'
        if g[20*SZ][18*SZ]=='s': g[20*SZ][18*SZ]='m'
    if opt.get('mustache'):
        for c in range(13*SZ,23*SZ):
            if g[20*SZ][c]=='s': g[20*SZ][c]='e'
        for c in (13*SZ,22*SZ):
            if g[19*SZ][c]=='s': g[19*SZ][c]='e'
    if opt.get('goatee'):
        for c in range(16*SZ,20*SZ):
            if g[23*SZ][c]=='s': g[23*SZ][c]='e'
        if g[22*SZ][17*SZ]=='s': g[22*SZ][17*SZ]='e'
        if g[22*SZ][18*SZ]=='s': g[22*SZ][18*SZ]='e'
    if opt.get('headphones'):
        for c in range(5*SZ,31*SZ):
            x=(c-cx)/orx
            if abs(x)<=1.0:
                br=int(round(ocy-ory*math.sqrt(max(0.0,1-x*x))))+1
                for bb,col in ((br,'P'),(br+1,'p')):
                    if 0<=bb<HEADH and g[bb][c] in 'h.': g[bb][c]=col
        for ux in (4*SZ,31*SZ):
            for dy in range(-3*SZ,4*SZ):
                for dx in range(-2*SZ,3*SZ):
                    if (dx/(2.2*SZ))**2+(dy/(3.2*SZ))**2<=1.0:
                        rr,ccc=15*SZ+dy,ux+dx
                        if 0<=rr<HEADH and 0<=ccc<W: g[rr][ccc]='p'
            for dy in range(-2*SZ,3*SZ):
                if 0<=15*SZ+dy<HEADH: g[15*SZ+dy][ux]='G'
    if opt.get('beret'):
        for r in range(0,8*SZ):
            for c in range(W):
                if g[r][c]=='h': g[r][c]='q'
        for c in range(W):
            if g[3*SZ][c]=='q' and c<cx: g[3*SZ][c]='Q'
        for r in range(1,HEADH-1):
            for c in range(W):
                if g[r][c]=='q' and g[r+1][c]=='h': g[r+1][c]='g'
        g[0]=['.']*W
        for c in range(16*SZ,18*SZ): g[0][c]='b'
    if opt.get('crown'):
        g[0]=['.']*W
        for c in [11*SZ,13*SZ,15*SZ,17*SZ,19*SZ]: g[0][c]='c'
        g[1]=['.']*W
        for c in range(11*SZ,24*SZ): g[1][c]='c'
    skin_shade(g)
    return g

def make_body(outfit, hairstyle):
    g=[['.']*W for _ in range(9*SZ)]
    bounds={0:(12*SZ,23*SZ),1:(11*SZ,24*SZ),2:(10*SZ,25*SZ),3:(10*SZ,25*SZ),4:(10*SZ,25*SZ),
            5:(10*SZ,25*SZ),6:(10*SZ,25*SZ),7:(11*SZ,23*SZ),8:(12*SZ,23*SZ)}
    # expand bounds dict to cover all SZ rows per original row
    full_bounds={}
    for orig_r,(a,b) in bounds.items():
        for sr in range(SZ):
            full_bounds[orig_r*SZ+sr]=(a,b)
    for r,(a,b) in full_bounds.items():
        for c in range(a,b+1): g[r][c]='b'
    for r in range(3*SZ,6*SZ):                       # hands
        g[r][9*SZ]='s'; g[r][26*SZ]='s'
    # subtle body shading
    for sr in range(SZ):
        g[4*SZ+sr][12*SZ]='k'; g[4*SZ+sr][13*SZ]='k'; g[4*SZ+sr][22*SZ]='B'
        g[5*SZ+sr][12*SZ]='k'; g[5*SZ+sr][22*SZ]='B'
    # ---- outfit details ----
    if outfit=='robe':           # Jamesmie: gold-trim collar + medallion
        for c in range(12*SZ,24*SZ):
            for sr in range(SZ): g[0*SZ+sr][c]='c'
        for sr in range(SZ):
            g[1*SZ+sr][12*SZ]='c'; g[1*SZ+sr][23*SZ]='c'
        for sr in range(SZ):
            g[3*SZ+sr][17*SZ]='c'; g[3*SZ+sr][18*SZ]='c'; g[4*SZ+sr][17*SZ]='c'   # medallion
    elif outfit=='tie':          # Manager: white collar + tie
        for c in range(12*SZ,24*SZ):
            for sr in range(SZ): g[0*SZ+sr][c]='w'
        for sr in range(SZ):
            g[1*SZ+sr][15*SZ]='w'; g[1*SZ+sr][16*SZ]='w'; g[1*SZ+sr][19*SZ]='w'; g[1*SZ+sr][20*SZ]='w'
        for r in range(1*SZ,7*SZ):
            g[r][17*SZ]='g'; g[r][18*SZ]='g'
        for sr in range(SZ):
            g[1*SZ+sr][17*SZ]='w'; g[1*SZ+sr][18*SZ]='w'
    elif outfit=='cardigan':     # Reader: collar + button placket
        for c in range(13*SZ,23*SZ):
            for sr in range(SZ): g[0*SZ+sr][c]='w'
        for r in range(1*SZ,7*SZ):
            g[r][17*SZ]='k'; g[r][18*SZ]='k'
        for orig_r in (2,4,6):
            for sr in range(SZ): g[orig_r*SZ+sr][17*SZ]='w'   # buttons
    elif outfit=='hoodie':       # Coder: hood + drawstrings
        for c in range(11*SZ,25*SZ):
            for sr in range(SZ): g[0*SZ+sr][c]='k'
        for c in range(12*SZ,24*SZ):
            for sr in range(SZ): g[1*SZ+sr][c]='k'
        for sr in range(SZ):
            g[1*SZ+sr][14*SZ]='b'; g[1*SZ+sr][21*SZ]='b'
        for r in range(2*SZ,5*SZ):
            g[r][16*SZ]='w'; g[r][19*SZ]='w'   # drawstrings
        for sr in range(SZ):
            g[2*SZ+sr][17*SZ]='k'; g[2*SZ+sr][18*SZ]='k'
    elif outfit=='jacket':       # Searcher: open jacket + white tee
        for c in range(15*SZ,21*SZ):
            for r in range(0,7*SZ):
                if g[r][c]=='b': g[r][c]='w'
        for r in range(1*SZ,7*SZ):
            g[r][14*SZ]='k'; g[r][21*SZ]='k'   # lapels
        for sr in range(SZ):
            g[0*SZ+sr][14*SZ]='k'; g[0*SZ+sr][21*SZ]='k'
    elif outfit=='scarf':        # Writer: turtleneck + maroon scarf
        for c in range(12*SZ,24*SZ):
            for sr in range(SZ): g[0*SZ+sr][c]='r'
        for c in range(11*SZ,25*SZ):
            for sr in range(SZ): g[1*SZ+sr][c]='r'
        for sr in range(SZ):
            g[2*SZ+sr][12*SZ]='R'; g[2*SZ+sr][13*SZ]='r'; g[2*SZ+sr][14*SZ]='r'        # hanging end
        for c in range(15*SZ,21*SZ):
            for sr in range(SZ): g[2*SZ+sr][c]='r'
    # ---- long / wavy hair draping over shoulders ----
    if hairstyle=='long':
        for r in range(0,9*SZ):
            cols=list(range(5*SZ,9*SZ))+list(range(27*SZ,31*SZ)) if r<6*SZ else list(range(5*SZ,8*SZ))+list(range(28*SZ,31*SZ))
            for c in cols:
                if g[r][c]=='.': g[r][c]='h'
    elif hairstyle=='wavy':
        for r in range(0,5*SZ):
            for c in list(range(6*SZ,8*SZ))+list(range(28*SZ,30*SZ)):
                if g[r][c]=='.': g[r][c]='h'
    return g

def make_back(opt):
    """Up/back view: full hair silhouette, no face. Keep crown/beret/headphones."""
    g=[['.']*W for _ in range(HEADH)]
    fcy,frx,fry = 15.5*SZ, 11.0*SZ, 10.8*SZ
    for r in range(HEADH):
        for c in range(W):
            if r>=9*SZ and ((c-cx)/frx)**2+((r-fcy)/fry)**2<=1.0: g[r][c]='s'
    build_hair(g, opt)
    for r in range(HEADH):                 # back of head: skin area becomes hair
        for c in range(W):
            if g[r][c]=='s': g[r][c]='h'
    if opt.get('headphones'):
        orx,ory,ocy = 12.7*SZ,12.7*SZ,12.0*SZ
        for c in range(5*SZ,31*SZ):
            x=(c-cx)/orx
            if abs(x)<=1.0:
                br=int(round(ocy-ory*math.sqrt(max(0.0,1-x*x))))+1
                for bb,col in ((br,'P'),(br+1,'p')):
                    if 0<=bb<HEADH and g[bb][c] in 'h.': g[bb][c]=col
        for ux in (4*SZ,31*SZ):
            for dy in range(-3*SZ,4*SZ):
                for dx in range(-2*SZ,3*SZ):
                    if (dx/(2.2*SZ))**2+(dy/(3.2*SZ))**2<=1.0 and 0<=15*SZ+dy<HEADH: g[15*SZ+dy][ux]='p'
            for dy in range(-2*SZ,3*SZ):
                if 0<=15*SZ+dy<HEADH: g[15*SZ+dy][ux]='G'
    if opt.get('beret'):
        for r in range(0,8*SZ):
            for c in range(W):
                if g[r][c]=='h': g[r][c]='q'
        for c in range(W):
            if g[3*SZ][c]=='q' and c<cx: g[3*SZ][c]='Q'
        for r in range(1,HEADH-1):
            for c in range(W):
                if g[r][c]=='q' and g[r+1][c]=='h': g[r+1][c]='g'
        g[0]=['.']*W
        for c in range(16*SZ,18*SZ): g[0][c]='b'
    if opt.get('crown'):
        g[0]=['.']*W
        for c in [11*SZ,13*SZ,15*SZ,17*SZ,19*SZ]: g[0][c]='c'
        g[1]=['.']*W
        for c in range(11*SZ,24*SZ): g[1][c]='c'
    return g

def make_body_back(outfit, hairstyle):
    """Back of the torso: plain shirt + hood/scarf-from-behind + long-hair drape."""
    g=[['.']*W for _ in range(9*SZ)]
    bounds={0:(12*SZ,23*SZ),1:(11*SZ,24*SZ),2:(10*SZ,25*SZ),3:(10*SZ,25*SZ),4:(10*SZ,25*SZ),
            5:(10*SZ,25*SZ),6:(10*SZ,25*SZ),7:(11*SZ,23*SZ),8:(12*SZ,23*SZ)}
    full_bounds={}
    for orig_r,(a,b) in bounds.items():
        for sr in range(SZ):
            full_bounds[orig_r*SZ+sr]=(a,b)
    for r,(a,b) in full_bounds.items():
        for c in range(a,b+1): g[r][c]='b'
    for r in range(3*SZ,6*SZ): g[r][9*SZ]='s'; g[r][26*SZ]='s'
    for sr in range(SZ):
        g[4*SZ+sr][12*SZ]='k'; g[5*SZ+sr][12*SZ]='k'; g[4*SZ+sr][22*SZ]='B'; g[5*SZ+sr][22*SZ]='B'
    if outfit=='hoodie':
        for c in range(11*SZ,25*SZ):
            for sr in range(SZ): g[0*SZ+sr][c]='k'
        for c in range(12*SZ,24*SZ):
            for sr in range(SZ): g[1*SZ+sr][c]='k'
    elif outfit=='scarf':
        for c in range(12*SZ,24*SZ):
            for sr in range(SZ): g[0*SZ+sr][c]='r'
        for c in range(11*SZ,25*SZ):
            for sr in range(SZ): g[1*SZ+sr][c]='r'
    if hairstyle=='long':
        for r in range(0,9*SZ):
            cols=list(range(5*SZ,9*SZ))+list(range(27*SZ,31*SZ)) if r<6*SZ else list(range(5*SZ,8*SZ))+list(range(28*SZ,31*SZ))
            for c in cols:
                if g[r][c]=='.': g[r][c]='h'
    elif hairstyle=='wavy':
        for r in range(0,5*SZ):
            for c in list(range(6*SZ,8*SZ))+list(range(28*SZ,30*SZ)):
                if g[r][c]=='.': g[r][c]='h'
    return g

def _upscale_legs(orig_rows):
    """Nearest-neighbour upscale: each cell repeated SZ times horizontally,
    each row repeated SZ times vertically."""
    result=[]
    for row in orig_rows:
        expanded=''.join(ch*SZ for ch in row)
        for _ in range(SZ):
            result.append(expanded)
    return result

_LEGS_CUTE_ORIG = {
 'stand':['............llll...llll.............','............llll...llll.............',
          '............zzzz...zzzz.............','............zzzzz.zzzzz.............'],
 'walk1':['.............lllll..ll..............','.............lllll..ll..............',
          '.............zzzzz..zz..............','..............zzzz.zzz..............'],
 'walk2':['.............ll..lllll..............','.............ll..lllll..............',
          '.............zz..zzzzz..............','..............zzz.zzzz..............'],
}
LEGS_CUTE = {k: _upscale_legs(v) for k,v in _LEGS_CUTE_ORIG.items()}

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
ALLOWED=set('.shHjxbBnkdDLlzwcezmgGiPpqQrR')
def validate(grid,name):
    ok=True
    for i,row in enumerate(grid):
        if len(row)!=W: print(f'WIDTH {name} r{i}: {len(row)}'); ok=False
        bad=set(row)-ALLOWED
        if bad: print(f'CHAR {name} r{i}: {sorted(bad)}'); ok=False
    return ok

def assemble(name, opt, outfit, hairstyle):
    """Return (bd, bu) as joined W-wide strings (head+torso, 35*SZ rows each)."""
    fg=make_head(opt)+make_body(outfit,hairstyle); shade_hair(fg,hairstyle); shade_body(fg)
    bg=make_back(opt)+make_body_back(outfit,hairstyle); shade_hair(bg,hairstyle); shade_body(bg)
    bd=[''.join(r) for r in fg]
    bu=[''.join(r) for r in bg]
    for tag,grid in (('BD',bd),('BU',bu)):
        if not validate(grid, f'{name}.{tag}'): raise SystemExit('grid errors')
        assert len(grid)==35*SZ, f'{name}.{tag} height {len(grid)} != {35*SZ}'
    return bd,bu

def all_frames_uniform():
    """Assert every assembled full frame (head+torso+each leg variant) is 39*SZ x W."""
    for name,bd,hr,sk,opt,outfit,hairstyle in CFG:
        b_d,b_u=assemble(name,opt,outfit,hairstyle)
        for top in (b_d,b_u):
            for lk in ('stand','walk1','walk2'):
                full=top+LEGS_CUTE[lk]
                assert len(full)==39*SZ, f'{name} {lk} height {len(full)}'
                if not validate(full, f'{name}.{lk}'): raise SystemExit('grid errors')
    print(f'all frames uniform: {39*SZ}x{W}')

def js_array(name, rows):
    body=',\n'.join("  '"+r+"'" for r in rows)
    return f'const {name} = [\n{body}\n];\n'

def emit_js():
    out=[]
    out.append('// ============================================================')
    out.append(f'// CUTE SPRITES ({W}-wide, spriteScale 1) — generated by py/gen_sprites.py.')
    out.append('// DO NOT hand-edit; rerun: python py/gen_sprites.py --emit')
    out.append('// ============================================================')
    for lk,const in (('stand','LEGS_CUTE_STAND'),('walk1','LEGS_CUTE_WALK1'),('walk2','LEGS_CUTE_WALK2')):
        out.append(js_array(const, LEGS_CUTE[lk]))
    sprites=[]
    for name,bd,hr,sk,opt,outfit,hairstyle in CFG:
        u=name.upper()
        a,b=assemble(name,opt,outfit,hairstyle)
        out.append(js_array(f'{u}_BD', a))
        out.append(js_array(f'{u}_BU', b))
        sprites.append(
            f'const SPRITES_{u}2 = {{\n'
            f'  down: {{ stand: [...{u}_BD, ...LEGS_CUTE_STAND], walk1: [...{u}_BD, ...LEGS_CUTE_WALK1], walk2: [...{u}_BD, ...LEGS_CUTE_WALK2] }},\n'
            f'  up:   {{ stand: [...{u}_BU, ...LEGS_CUTE_STAND], walk1: [...{u}_BU, ...LEGS_CUTE_WALK1], walk2: [...{u}_BU, ...LEGS_CUTE_WALK2] }},\n'
            f'}};\n')
    out.extend(sprites)
    return '\n'.join(out)

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
        fg=make_head(opt)+make_body(outfit,hairstyle); shade_hair(fg,hairstyle); shade_body(fg)
        g=[''.join(r) for r in fg] + LEGS_CUTE['stand']
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
        bg=make_back(opt)+make_body_back(outfit,hairstyle); shade_hair(bg,hairstyle); shade_body(bg)
        g=[''.join(r) for r in bg] + LEGS_CUTE['stand']
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

if '--emit' in sys.argv:
    all_frames_uniform()
    with open('__sprites_block.js','w',encoding='utf-8') as f:
        f.write(emit_js())
    print('wrote __sprites_block.js')
else:
    all_frames_uniform()
    canvas,CW,CH=build(); write_png('__cute_preview.png',canvas,CW,CH)
    print('wrote __cute_preview.png',CW,'x',CH,'-> Jamesmie Manager Reader Coder Searcher Writer')
    cb,cbw,cbh=build_back(); write_png('__back_preview.png',cb,cbw,cbh)
    print('wrote __back_preview.png')
