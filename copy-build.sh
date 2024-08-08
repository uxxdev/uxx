#!/bin/bash

destination_folder="$HOME/.config/ArmCord/plugins/1loader/dist"
source_folder="./dist"

cp -f "$source_folder/browser.js" "$destination_folder/bundle.js"
cp -f "$source_folder/browser.css" "$destination_folder/bundle.css"
