from PIL import Image, ImageDraw, ImageFont
W,H=1200,630
img=Image.new("RGB",(W,H),(5,5,5))
d=ImageDraw.Draw(img)
# soft glow
for r in range(420,0,-6):
    a=int(40*(1-r/420)**2)
    d.ellipse((W/2-r,170-r,W/2+r,170+r),fill=(5+a,5+a//3,5))
orange=(242,125,38)
reg=ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf",92)
bold=ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf",92)
tag=ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf",44)
# reticle mark
cx,cy,R=W//2,190,58
d.ellipse((cx-R,cy-R,cx+R,cy+R),outline=orange,width=8)
d.ellipse((cx-10,cy-10,cx+10,cy+10),fill=orange)
for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)):
    d.line((cx+dx*(R-6),cy+dy*(R-6),cx+dx*(R+26),cy+dy*(R+26)),fill=orange,width=8)
a="Release"; b="Scope"
wa=d.textlength(a,font=reg); wb=d.textlength(b,font=bold)
x=(W-(wa+wb))/2
d.text((x,310),a,font=reg,fill=(255,255,255))
d.text((x+wa,310),b,font=bold,fill=orange)
t="See every release the moment it ships."
d.text(((W-d.textlength(t,font=tag))/2,450),t,font=tag,fill=(190,190,190))
img.save("public/og-default.png",optimize=True)
print(img.size)
