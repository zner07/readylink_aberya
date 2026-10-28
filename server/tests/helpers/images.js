'use strict';
/* Tiny REAL images (a few hundred bytes each) for the tests, made with an image library and stored as base64.
   They have valid headers and end markers, so they pass the same checks real photos pass. */
const FILES = {
  jpeg: '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAJAAwDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwB8P9mf2afN/wCPra2Pvdece3pWdRRXsUqPs3J8zd3fV3t5LsjyJ1OZJWSt2/U//9k=',
  png: 'iVBORw0KGgoAAAANSUhEUgAAAAwAAAAJCAIAAACJ2loDAAAAKUlEQVR42mPUqDjBQAgwMRABWCDUiYAEZFGLDQtINol6ihip5juiFAEAUmwF469bfFkAAAAASUVORK5CYII=',
  webp: 'UklGRmIAAABXRUJQVlA4IFYAAABQAgCdASoMAAkAAoBCJbACdLoB+AADISbCd5AA9r3n8vs6xd3QDgM5YVk0ne+O7KG5X3Bn0HCPIjaz/0XP19uvBn7vonHH3ifdfP+8Bz5nDWjEdl4AAA==',
};

const buffer = (type) => Buffer.from(FILES[type], 'base64');
const dataUrl = (type, declared = type) => `data:image/${declared};base64,${FILES[type]}`;
const dataUrlFromBuffer = (buf, mime) => `data:${mime};base64,${buf.toString('base64')}`;

module.exports = { buffer, dataUrl, dataUrlFromBuffer };
