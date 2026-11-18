import {mountApp} from '/organise/app.js';
export const CONTRACT=1;
export const BUILD='4.31.2';
export const NEWS='More reliable saves and stable library focus';
export const SECTIONS=[["contacts", "Contacts"]];
export const mount=(root,F)=>mountApp(root,F,'people');
