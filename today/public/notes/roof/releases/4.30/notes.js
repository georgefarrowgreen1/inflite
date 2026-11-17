import {mountApp} from "/organise/releases/4.30/app.js";
export const CONTRACT=1;
export const BUILD='4.30';
export const NEWS='Refined libraries, calmer editors and retained navigation';
export const SECTIONS=[["all", "All notes"]];
export const mount=(root,F)=>mountApp(root,F,'notes');
