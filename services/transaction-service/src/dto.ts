import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, Min, ValidateNested } from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  code?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export class TransactionItemDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice?: number;
}

export class CreateTransactionDto {
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{1,50}$/)
  code?: string;

  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TransactionItemDto)
  items!: TransactionItemDto[];
}

export class CreateGenericTransactionDto extends CreateTransactionDto {
  @IsIn(['INBOUND', 'OUTBOUND'])
  type!: 'INBOUND' | 'OUTBOUND';
}
