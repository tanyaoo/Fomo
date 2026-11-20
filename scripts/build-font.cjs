'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const regular=fs.readFileSync(path.join(root,'vendor/barlow/Barlow-Regular.ttf'));
const semibold=fs.readFileSync(path.join(root,'vendor/barlow/Barlow-SemiBold.ttf'));
fs.copyFileSync(path.join(root,'vendor/barlow/OFL.txt'),path.join(root,'dist/OFL-Barlow.txt'));
// Keep the preview, single HTML export, and desktop bundle offline and identical.
fs.writeFileSync(path.join(root,'dist/numbers-font.css'),'/* Barlow SemiBold — SIL OFL 1.1; vendor/barlow/OFL.txt */\n@font-face{font-family:"WriteBoom Numbers";src:url("data:font/ttf;base64,'+semibold.toString('base64')+'") format("truetype");font-style:normal;font-weight:600;font-display:swap}\n');
fs.writeFileSync(path.join(root,'dist/ui-font.css'),'/* Barlow Regular and SemiBold — SIL OFL 1.1; vendor/barlow/OFL.txt */\n@font-face{font-family:"WriteBoom UI";src:url("data:font/ttf;base64,'+regular.toString('base64')+'") format("truetype");font-style:normal;font-weight:400;font-display:swap}\n@font-face{font-family:"WriteBoom UI";src:url("data:font/ttf;base64,'+semibold.toString('base64')+'") format("truetype");font-style:normal;font-weight:600;font-display:swap}\n');
