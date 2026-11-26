"""Lecture des ressources RSC7 de GTA V (fichiers .yft et .ytd de mods de véhicules)."""
import struct, zlib

def taille(flags):
    s = (((flags >> 27) & 1) << 0) + (((flags >> 26) & 1) << 1) + (((flags >> 25) & 1) << 2) + (((flags >> 24) & 1) << 3) \
        + (((flags >> 17) & 0x7F) << 4) + (((flags >> 11) & 0x3F) << 5) + (((flags >> 7) & 0xF) << 6) \
        + (((flags >> 5) & 0x3) << 7) + (((flags >> 4) & 0x1) << 8)
    return (0x200 << (flags & 0xF)) * s

def joaat(s):
    h = 0
    for c in s.lower().encode('latin-1'):
        h = (h + c) & 0xFFFFFFFF
        h = (h + (h << 10)) & 0xFFFFFFFF
        h ^= h >> 6
    h = (h + (h << 3)) & 0xFFFFFFFF
    h ^= h >> 11
    return (h + (h << 15)) & 0xFFFFFFFF

class Res:
    def __init__(self, chemin):
        d = open(chemin, 'rb').read()
        magic, self.version, sf, gf = struct.unpack_from('<4I', d, 0)
        assert magic == 0x37435352, 'pas un RSC7'
        self.d = zlib.decompress(d[16:], -15)
        self.sys, self.gfx = taille(sf), taille(gf)
    def off(self, p):
        if p == 0: return None
        seg = p >> 28
        o = p & 0x0FFFFFFF
        if seg == 5: return o
        if seg == 6: return self.sys + o
        return None
    def u8(self, o): return self.d[o]
    def u16(self, o): return struct.unpack_from('<H', self.d, o)[0]
    def i16(self, o): return struct.unpack_from('<h', self.d, o)[0]
    def u32(self, o): return struct.unpack_from('<I', self.d, o)[0]
    def u64(self, o): return struct.unpack_from('<Q', self.d, o)[0]
    def f32(self, o, n=1):
        v = struct.unpack_from('<%df' % n, self.d, o)
        return v[0] if n == 1 else v
    def ptr(self, o): return self.off(self.u64(o))
    def chaine(self, o):
        if o is None: return None
        e = self.d.index(b'\0', o)
        return self.d[o:e].decode('latin-1')
    def liste_ptr(self, o):
        """ResourcePointerList64 : pointeur + nombre -> liste d'offsets."""
        p, n = self.ptr(o), self.u16(o + 8)
        return [] if p is None else [self.ptr(p + 8 * i) for i in range(n)]
    def vide(self, o, n=8):
        return [hex(self.u64(o + 8 * i)) for i in range(n)]
