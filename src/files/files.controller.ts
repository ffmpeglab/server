import {
  All,
  Controller,
  Get,
  Param,
  Post,
  Request,
  Response,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesService } from './files.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/auth.guard';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiExcludeEndpoint,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { FileListDto, FileResponseDto, FileUploadDto } from './file.dto';
import { _Object$ } from '@aws-sdk/client-s3';
// import { TusService } from './tus';

@UseGuards(AuthGuard)
@Controller('files')
@ApiBearerAuth()
export class FilesController {
  constructor(
    private readonly filesService: FilesService,
    // private readonly tusService: TusService,
  ) {}

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiBody({
    description: 'File',
    type: FileUploadDto,
  })
  async upload(
    @UploadedFile()
    file: { buffer: Buffer<ArrayBufferLike>; originalname: string },
    @Request() req: Request & { user: string },
  ) {
    return this.filesService.uploadFile(
      req.user,
      file.originalname,
      file.buffer,
    );
  }

  @Get('list')
  @ApiResponse({ type: FileListDto, isArray: true })
  async list(@Request() req: Request & { user: string }) {
    return this.filesService.listFiles(req.user);
  }

  @Get('file/:id')
  @ApiParam({
    name: 'id',
    description: 'The ID of the file',
    required: true,
    type: String,
  })
  @ApiResponse({ type: FileResponseDto })
  async file(
    @Param() params: { id: string },
    @Request() req: Request & { user: string },
  ) {
    return this.filesService.getFile(params.id, req.user);
  }
}
