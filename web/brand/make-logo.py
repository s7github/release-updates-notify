from PIL import Image, ImageDraw
K=4; N=512*K
img=Image.new("RGB",(N,N),(5,5,5)); d=ImageDraw.Draw(img)
o=(242,125,38); c=N//2; R=int(N*0.24); w=int(N*0.05)
d.ellipse((c-R,c-R,c+R,c+R),outline=o,width=w)
r=int(N*0.045); d.ellipse((c-r,c-r,c+r,c+r),fill=o)
for dx,dy in((1,0),(-1,0),(0,1),(0,-1)):
    d.line((c+dx*(R-int(w*0.5)),c+dy*(R-int(w*0.5)),c+dx*(R+int(N*0.13)),c+dy*(R+int(N*0.13))),fill=o,width=w)
img=img.resize((512,512),Image.LANCZOS); img.save("public/brand/logo-512.png",optimize=True)
