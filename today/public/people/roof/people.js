import {mountApp} from '/organise/app.js';
export const CONTRACT=1;
export const BUILD='4.02';
export const NEWS='Redesigned Calendar, Notes and People with Liquid Glass';
export const SECTIONS=[["contacts", "Contacts"]];
export const mount=(root,F)=>mountApp(root,F,'people');
