import {mountApp} from '/organise/app.js';
export const CONTRACT=1;
export const BUILD='4.31.1';
export const NEWS='Refined libraries, calmer editors and retained navigation';
export const SECTIONS=[["week", "Week"], ["agenda", "Month"]];
export const mount=(root,F)=>mountApp(root,F,'calendar');
