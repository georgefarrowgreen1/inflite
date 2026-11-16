import {mountApp} from '/organise/app.js';
export const CONTRACT=1;
export const BUILD='4.01';
export const NEWS='A clearer Calendar, Notes library and People profiles';
export const SECTIONS=[["all", "All notes"]];
export const mount=(root,F)=>mountApp(root,F,'notes');
