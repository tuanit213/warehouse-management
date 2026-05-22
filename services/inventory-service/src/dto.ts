import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';

export class CreateWarehouseDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  address?: string;
}

export class UpdateWarehouseDto {
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
  address?: string;
}

export class CreateLocationDto {
  @IsUUID()
  warehouseId!: string;

  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateLocationDto {
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  code?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpsertStockDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minQuantity?: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class AdjustStockDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @Type(() => Number)
  @IsNumber()
  delta!: number;

  @IsOptional()
  @IsUUID()
  referenceId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class TransferStockDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  fromWarehouseId!: string;

  @IsOptional()
  @IsUUID()
  fromLocationId?: string;

  @IsUUID()
  toWarehouseId!: string;

  @IsOptional()
  @IsUUID()
  toLocationId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  quantity!: number;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class StocktakeLineDto {
  @IsUUID()
  productId!: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  countedQuantity!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CreateStocktakeDto {
  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StocktakeLineDto)
  items?: StocktakeLineDto[];
}

export class UpdateStocktakeCountsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StocktakeLineDto)
  items!: StocktakeLineDto[];
}

export class ApproveStocktakeDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class CreateReservationDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  warehouseId!: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  quantity!: number;

  @IsOptional()
  @IsString()
  referenceType?: string;

  @IsOptional()
  @IsUUID()
  referenceId?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ReleaseReservationDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ReservationQueryDto {
  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @IsOptional()
  @IsIn(['RESERVED', 'RELEASED', 'CONSUMED'])
  status?: 'RESERVED' | 'RELEASED' | 'CONSUMED';
}
