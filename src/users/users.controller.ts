import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthGuard } from '../common/guards/auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../enums/user-role.enum';
import {
  CreateUserDto,
  UpdateUserAdminDto,
  UpdateUserDto,
  UsersQueryDto,
} from './users.dto';

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get()
  async findAll(@Query() query: UsersQueryDto) {
    return await this.usersService.findAll(query);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post()
  async create(@Body() dto: CreateUserDto) {
    return await this.usersService.adminCreate(dto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserAdminDto,
  ) {
    return await this.usersService.adminUpdate(id, dto);
  }

  @Get('profile')
  async getProfile(@CurrentUser('id') userId: number) {
    return await this.usersService.getProfile(userId);
  }

  @Put('profile')
  async updateProfile(
    @CurrentUser('id') userId: number,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return await this.usersService.updateProfile(userId, updateUserDto);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return await this.usersService.findById(id);
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return await this.usersService.adminRemove(id);
  }
}
