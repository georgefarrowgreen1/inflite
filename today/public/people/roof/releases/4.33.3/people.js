import {mountApp} from "/organise/releases/4.33.3/app.js";
export const CONTRACT=1;
export const BUILD='4.33.3';
export const NEWS="Calendar, Notes and People load and refresh more quickly.";
export const SECTIONS=[["contacts", "Contacts"]];
export const mount=(root,F)=>mountApp(root,F,'people');
