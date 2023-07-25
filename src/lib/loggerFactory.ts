/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable no-console */
import { format } from 'util';
import { createLogger, Logger, transports, format as winstonFormat } from 'winston';

const { combine, printf } = winstonFormat;
const { Console } = transports;
const SPLAT = Symbol.for('splat');
const LEVEL = Symbol.for('level');
const MESSAGE = Symbol.for('message');

export class LoggerFactory {
  private static instance: LoggerFactory;
  private static logger: Logger;

  private constructor() {
    LoggerFactory.logger = createLogger({
      level: process.env.LOGGING_LEVEL || 'info',
      format: combine(
        // @ts-ignore
        printf(({ level, message, [SPLAT]: args = [] }) => {
          // if AWS_REGION, assuming these logs are going to CloudWatch, and level will natively be part of message
          return process.env.AWS_REGION
            ? format(message, ...args)
            : `${level.toUpperCase()}: ${format(message, ...args)}`;
        })
      ),
      transports: [
        new Console({
          log(info, callback) {
            // @ts-ignore
            setImmediate(() => this.emit('logged', info));

            switch (info[LEVEL]) {
              case 'error': {
                console.error(info[MESSAGE]);
                break;
              }
              case 'warn': {
                console.warn(info[MESSAGE]);
                break;
              }
              case 'info': {
                console.info(info[MESSAGE]);
                break;
              }
              case 'debug': {
                console.debug(info[MESSAGE]);
                break;
              }
              default: {
                // Not supporting other log levels at this time
              }
            }

            if (callback) {
              callback();
            }
          }
        })
      ]
    });
  }

  public static getLogger(): Logger {
    if (!LoggerFactory.instance) {
      LoggerFactory.instance = new LoggerFactory();
    }
    return LoggerFactory.logger;
  }
}