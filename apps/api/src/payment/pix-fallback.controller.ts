import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { PixFallbackService } from './pix-fallback.service';

@Controller('subscription/pix-fallback')
export class PixFallbackController {
  private readonly logger = new Logger(PixFallbackController.name);

  constructor(private readonly pix: PixFallbackService) {}

  @Get()
  getDetails(@CurrentUser() user: AuthenticatedUser) {
    return this.pix.getDetails(user.id);
  }

  @Post('receipt')
  @HttpCode(HttpStatus.OK)
  async submitReceipt(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: FastifyRequest,
  ) {
    // @fastify/multipart attaches `file()` to the request when content-type
    // is multipart/form-data. We only accept a single file field — that's
    // also the cap configured in main.ts.
    if (typeof req.file !== 'function') {
      throw new BadRequestException('Expected multipart/form-data with a single file field');
    }
    const upload = await req.file();
    if (!upload) {
      throw new BadRequestException('Missing file');
    }
    let buffer: Buffer;
    try {
      buffer = await upload.toBuffer();
    } catch (e) {
      // toBuffer() throws @fastify/multipart's `RequestFileTooLargeError`
      // when the body exceeds the configured fileSize limit.
      this.logger.warn(`Pix receipt upload failed: ${(e as Error).message}`);
      throw new BadRequestException('Arquivo inválido ou maior que 5MB');
    }
    return this.pix.submitReceipt(user.id, {
      buffer,
      mimetype: upload.mimetype,
      size: buffer.length,
    });
  }
}
