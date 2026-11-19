import {mountApp} from '/organise/app.js';
export const CONTRACT=1;
export const BUILD='4.32.3';
export const NEWS='One profile layout for Chat friends and saved contacts';
export const SECTIONS=[["contacts", "Contacts"]];
export const mount=(root,F)=>mountApp(root,F,'people');
