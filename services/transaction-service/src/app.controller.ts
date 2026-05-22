import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { CreateGenericTransactionDto, CreateSupplierDto, CreateTransactionDto, UpdateSupplierDto } from './dto';
import { TransactionService } from './transaction.service';

@Controller()
export class AppController {
  constructor(private readonly transactions: TransactionService) {}

  @Get('transaction')
  summary() { return { service: 'transaction-service', message: 'Inbound/outbound stock transaction API. Confirm uses synchronous inventory-service update for MVP.' }; }

  @Get('suppliers')
  listSuppliers() { return this.transactions.listSuppliers(); }

  @Post('suppliers')
  createSupplier(@Body() dto: CreateSupplierDto) { return this.transactions.createSupplier(dto); }

  @Patch('suppliers/:id')
  updateSupplier(@Param('id') id: string, @Body() dto: UpdateSupplierDto) { return this.transactions.updateSupplier(id, dto); }

  @Delete('suppliers/:id')
  deleteSupplier(@Param('id') id: string) { return this.transactions.deleteSupplier(id); }

  @Get('transactions')
  listTransactions(@Query('type') type?: string, @Query('status') status?: string) { return this.transactions.listTransactions(type, status); }

  @Post('transactions')
  createTransaction(@Body() dto: CreateGenericTransactionDto) { return this.transactions.createTransaction(dto); }

  @Get('transactions/:id')
  getTransaction(@Param('id') id: string) { return this.transactions.getTransaction(id); }

  @Post('transactions/:id/confirm')
  confirmTransaction(@Param('id') id: string) { return this.transactions.confirmTransaction(id); }

  @Post('transactions/:id/cancel')
  cancelTransaction(@Param('id') id: string) { return this.transactions.cancelTransaction(id); }

  @Post('inbounds')
  createInbound(@Body() dto: CreateTransactionDto) { return this.transactions.createInbound(dto); }

  @Post('inbounds/:id/confirm')
  confirmInbound(@Param('id') id: string) { return this.transactions.confirmTransaction(id); }

  @Post('inbounds/:id/cancel')
  cancelInbound(@Param('id') id: string) { return this.transactions.cancelTransaction(id); }

  @Get('inbounds/:id/pdf')
  async inboundPdf(@Param('id') id: string, @Res() res: any) {
    const pdf = await this.transactions.pdf(id);
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `inline; filename="inbound-${id}.pdf"`);
    return res.send(pdf);
  }

  @Post('outbounds')
  createOutbound(@Body() dto: CreateTransactionDto) { return this.transactions.createOutbound(dto); }

  @Post('outbounds/:id/confirm')
  confirmOutbound(@Param('id') id: string) { return this.transactions.confirmTransaction(id); }

  @Post('outbounds/:id/cancel')
  cancelOutbound(@Param('id') id: string) { return this.transactions.cancelTransaction(id); }

  @Get('outbounds/:id/pdf')
  async outboundPdf(@Param('id') id: string, @Res() res: any) {
    const pdf = await this.transactions.pdf(id);
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', `inline; filename="outbound-${id}.pdf"`);
    return res.send(pdf);
  }
}
