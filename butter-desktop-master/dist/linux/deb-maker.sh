#!/bin/bash
# launch 'deb-make.sh 0.12.1 linux32' for example

nw=$1
arch=$2
if [[ $arch == *"32"* ]]; then
  real_arch="i386"
else
  real_arch="amd64"
fi
cwd="build/releases/deb-package/$arch"
name="butter"
projectName="Butter"
read -n 9 revision <<< ` git log -1 --pretty=oneline`
version=$(sed -n 's|\s*\"version\"\:\ \"\(.*\)\"\,|\1|p' package.json)
package_name=${name}_${version}-${revision}_${real_arch}

### RESET
rm -rf build/releases/deb-package

build_pt () {

### SOURCE TREE
#create package dir
mkdir -p $cwd/$package_name

#create dir tree
mkdir -p $cwd/$package_name/usr/share/applications #desktop
mkdir -p $cwd/$package_name/opt/$projectName #app files
mkdir -p $cwd/$package_name/usr/share/icons #icon

### COPY FILES
#base
cp -r build/cache/$arch/$nw/locales $cwd/$package_name/opt/$projectName/
cp build/cache/$arch/$nw/icudtl.dat $cwd/$package_name/opt/$projectName/
cp build/cache/$arch/$nw/libffmpegsumo.so $cwd/$package_name/opt/$projectName/
cp build/cache/$arch/$nw/nw $cwd/$package_name/opt/$projectName/$projectName
cp build/cache/$arch/$nw/nw.pak $cwd/$package_name/opt/$projectName/

#src
cp -r src $cwd/$package_name/opt/$projectName/
cp package.json $cwd/$package_name/opt/$projectName/
cp LICENSE.txt $cwd/$package_name/opt/$projectName/
cp CHANGELOG.md $cwd/$package_name/opt/$projectName/

#node_modules
cp -r node_modules $cwd/$package_name/opt/$projectName/node_modules

#icon
cp src/app/images/posterholder.png $cwd/$package_name/usr/share/icons/butter.png

### CLEAN
shopt -s globstar
cd $cwd/$package_name/opt/$projectName
rm -rf node_modules/bower/** 
rm -rf node_modules/*grunt*/** 
rm -rf node_modules/stylus/** 
rm -rf ./**/test*/** 
rm -rf ./**/doc*/** 
rm -rf ./**/example*/** 
rm -rf ./**/demo*/** 
rm -rf ./**/bin/** 
rm -rf ./**/build/** 
rm -rf src/app/styl/**
rm -rf **/*.*~
cd ../../../../../../../

### CREATE FILES

#desktop
echo "[Desktop Entry]
Comment=Watch Movies and TV Shows instantly
Name=$projectName
Exec=/opt/$projectName/$projectName
Icon=butter
MimeType=application/x-bittorrent;x-scheme-handler/magnet;
StartupNotify=false
Categories=AudioVideo;Video;Network;Player;P2P;
Type=Application
" > $cwd/$package_name/usr/share/applications/$name.desktop

### DEBIAN
mkdir -p $cwd/$package_name/DEBIAN

#control
size=$((`du -sb $cwd/$package_name | cut -f1` / 1024))
echo "
Package: $name
Version: $version
Section: web
Priority: optional
Architecture: $real_arch
Installed-Size: $size
Depends:
Maintainer: $projectName Project <butter@xaiki.net>
Description: $projectName
 Watch Movies and TV Shows instantly
" > $cwd/$package_name/DEBIAN/control

#copyright
echo "Format: http://www.debian.org/doc/packaging-manuals/copyright-format/1.0
Upstream-Name: $projectName
Upstream-Contact: $projectName Project <butter@xaiki.net>
Source: https://github.com/butterproject/butter-desktop

Files: *
Copyright: © 2015, $projectName Project and the contributors <butter@xaiki.net>
License: GPL-3+
 This program is free software: you can redistribute it and/or modify
 it under the terms of the GNU General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.
 .
 This package is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU General Public License for more details.
 .
 You should have received a copy of the GNU General Public License
 along with this program.  If not, see <http://www.gnu.org/licenses/>.
 .
 On Debian systems, the complete text of the GNU General
 Public License version 3 can be found in \`/usr/share/common-licenses/GPL-3'." > $cwd/$package_name/DEBIAN/copyright

#postinstall script
#0777 is bad, but it allows to update & install vpn, and it's only 1 directory
echo "#!/bin/sh
set -e

# Work-around Menu item not being created on first installation
if [ -x /usr/bin/desktop-file-install ]; then
	desktop-file-install /usr/share/applications/$name.desktop
else
	chmod +x /usr/share/applications/$name.desktop
fi

# set permissions for updates
if [ -e /opt/$projectName/$projectName ]; then
	chmod -R 777 /opt/$projectName
fi

if [ ! -e /lib/$(arch)-linux-gnu/libudev.so.1 ]; then
	ln -s /lib/$(arch)-linux-gnu/libudev.so.0 /opt/$projectName/libudev.so.1
	sed -i 's,Exec=,Exec=env LD_LIBRARY_PATH=/opt/$projectName ,g' /usr/share/applications/$name.desktop
fi
" > $cwd/$package_name/DEBIAN/postinst

#pre-remove script
echo "#!/bin/sh
set -e

#remove app files
rm -rf /opt/$projectName

#remove icon
rm -rf /usr/share/icons/butter.png

#remove desktop
rm -rf /usr/share/applications/$name.desktop
" > $cwd/$package_name/DEBIAN/prerm

#post-remove script if purge
echo "#!/bin/sh
set -e

#remove config and db
if [ \"\$1\" = purge ]; then
	rm -rf \$HOME/.config/$projectName
fi
" > $cwd/$package_name/DEBIAN/postrm

### PERMISSIONS
chmod 0644 $cwd/$package_name/usr/share/applications/$name.desktop
chmod -R 0755 $cwd/$package_name/DEBIAN
chown -R root:root $cwd/$package_name 2> /dev/null || echo "'chown -R root:root' failed, continuing..."

### BUILD
cd $cwd
dpkg-deb --build $package_name

### CLEAN
cd ../../../../
mv $cwd/$name*.deb dist/linux
}


if [ -e /usr/bin/fakeroot ] && [ "$3" != "--fakeroot" ]; then
	echo "'fakeroot' was found on the machine"
	fakeroot bash $0 $1 $2 --fakeroot
else
	build_pt
fi
rm -rf build/releases/deb-package
