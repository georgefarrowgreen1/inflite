import {mountApp} from "/organise/releases/4.02/app.js";
export const CONTRACT=1;
export const BUILD='4.02';
export const NEWS='Redesigned Calendar, Notes and People with Liquid Glass';
export const SECTIONS=[["all", "All notes"]];
export const mount=(root,F)=>mountApp(root,F,'notes');
