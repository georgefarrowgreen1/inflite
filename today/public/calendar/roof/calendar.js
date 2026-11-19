import {mountApp} from '/organise/app.js';
export const CONTRACT=1;
export const BUILD='4.32.4';
export const NEWS='Removed unused app code';
export const SECTIONS=[["week", "Week"], ["agenda", "Month"]];
export const mount=(root,F)=>mountApp(root,F,'calendar');
