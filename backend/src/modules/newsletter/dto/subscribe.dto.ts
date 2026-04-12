import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class SubscribeDto {
  @IsEmail()
  @IsNotEmpty()
  @IsString()
  email: string;
}
