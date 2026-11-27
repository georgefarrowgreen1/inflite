import {mountApp} from '/organise/app.js';
export const CONTRACT=1;
export const BUILD='4.33.3';
export const NEWS="Calendar, Notes and People load and refresh more quickly.";
export const SECTIONS=[["all", "All notes"]];
export const mount=(root,F)=>mountApp(root,F,'notes');
