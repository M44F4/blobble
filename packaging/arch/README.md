# Arch / AUR package: blobble-bin

`PKGBUILD` repackages a release's `.deb` as an Arch package, so Omarchy and other Arch users can
install Blobble with `yay -S blobble-bin` (once it is on the AUR). The app puts its own Omarchy
bar widget in place the first time it runs.

## Try it locally

```bash
cd packaging/arch
makepkg -si
blobble          # run it once; then add Blobble to your bar
```

## Update it for a new release

1. Change `pkgver` (and reset `pkgrel=1`).
2. `updpkgsums` (or put the new `.deb`'s `sha256sum` in by hand).
3. `makepkg --printsrcinfo > .SRCINFO`
4. Build once with `makepkg -f`, then push `PKGBUILD` and `.SRCINFO` to the AUR repo.

## First submission to the AUR

You need an [AUR account](https://aur.archlinux.org) with your SSH key added.

```bash
git clone ssh://aur@aur.archlinux.org/blobble-bin.git aur-blobble-bin
cp PKGBUILD .SRCINFO aur-blobble-bin/ && cd aur-blobble-bin
git add PKGBUILD .SRCINFO && git commit -m "blobble-bin 0.1.2" && git push
```
