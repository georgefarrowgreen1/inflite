import {mountApp} from '/organise/app.js';
export const CONTRACT=1;
export const BUILD='4.32.3';
export const NEWS='More reliable saves and stable library focus';
export const SECTIONS=[["week", "Week"], ["agenda", "Month"]];
export const mount=(root,F)=>mountApp(root,F,'calendar');
