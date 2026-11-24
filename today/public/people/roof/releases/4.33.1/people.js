import {mountApp} from "/organise/releases/4.33.1/app.js";
export const CONTRACT=1;
export const BUILD='4.33.1';
export const NEWS='Removed unused app code';
export const SECTIONS=[["contacts", "Contacts"]];
export const mount=(root,F)=>mountApp(root,F,'people');
