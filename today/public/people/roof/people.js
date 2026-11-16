import {mountApp} from '/organise/app.js';
export const CONTRACT=1;
export const BUILD='4.00';
export const NEWS='Calendar, Notes and People in one InFlite';
export const SECTIONS=[["contacts", "Contacts"]];
export const mount=(root,F)=>mountApp(root,F,'people');
