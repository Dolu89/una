import * as https from 'https'
import fetch, { RequestInit } from 'node-fetch'
import { base64ToHex, IBackend, watchInvoices } from '..'
import { EHttpVerb, EInvoiceStatus } from '../../enums'
import { ICreateInvoice, ILndRest, Invoice } from '../../interfaces'
import { EventEmitter } from 'events'
import { IInvoice } from '.'

export default class LndRest implements IBackend {
  private readonly lndRest: ILndRest
  public readonly invoiceEmitter: EventEmitter
  public readonly invoicesToWatch: Invoice[]

  constructor (lndRest: ILndRest) {
    this.lndRest = lndRest
    this.invoicesToWatch = []
    this.invoiceEmitter = new EventEmitter()
  }

  public async createInvoice (invoice: ICreateInvoice): Promise<Invoice> {
    const amountMsat = invoice.amountMsats !== undefined ? invoice.amountMsats : invoice.amount * 1000

    const body = {
      value_msat: amountMsat,
      expiry: invoice.expireIn,
      fallback_addr: invoice.fallbackAddress,
      paymentPreimage: invoice.paymentPreimage,
      memo: invoice.description,
      description_hash: invoice.descriptionHash
    }

    const options = this.getRequestOptions(EHttpVerb.POST, body)
    const response = await fetch(this.lndRest.url + '/v1/invoices', options)
    const responseData = await response.json() as IInvoice

    return await this.getInvoice(base64ToHex(responseData.r_hash))
  }

  public async getInvoice (hash: string): Promise<Invoice> {
    const options = this.getRequestOptions(EHttpVerb.GET)
    const response = await fetch(this.lndRest.url + '/v1/invoice/' + hash, options)
    const responseData = await response.json() as IInvoice

    return this.toInvoice(responseData)
  }

  public watchInvoices (): EventEmitter {
    return this.invoiceEmitter
  }

  public startWatchingInvoices (): void {
    watchInvoices(this)
  }

  public async getPendingInvoices (): Promise<Invoice[]> {
    const options = this.getRequestOptions(EHttpVerb.GET)
    const results = await fetch(this.lndRest.url + '/v1/invoices?pending_only=true', options)
    const initalInvoices = await results.json() as { invoices: IInvoice[] }
    return initalInvoices.invoices.map(i => this.toInvoice(i))
  }

  private toDate (millisecond: string): Date {
    return new Date(Number(millisecond) * 1000)
  }

  private toInvoice (invoice: IInvoice): Invoice {
    let status: EInvoiceStatus = EInvoiceStatus.Pending
    if (invoice.state === 'OPEN') {
      status = EInvoiceStatus.Pending
    } else if (invoice.state === 'SETTLED') {
      status = EInvoiceStatus.Settled
    } else if (invoice.state === 'CANCELED') {
      status = EInvoiceStatus.Cancelled
    } else if (invoice.state === 'ACCEPTED') {
      status = EInvoiceStatus.Accepted
    }

    return {
      bolt11: invoice.payment_request,
      amount: Number(invoice.value),
      amountMsat: Number(invoice.value_msat),
      creationDate: this.toDate(invoice.creation_date),
      expiry: Number(invoice.expiry),
      memo: invoice.memo,
      settled: invoice.settled,
      settleDate: invoice.settle_date === '0' ? null : this.toDate(invoice.settle_date),
      paymentHash: base64ToHex(invoice.r_hash),
      preImage: base64ToHex(invoice.r_preimage),
      status
    }
  }

  private getRequestOptions (method: EHttpVerb, body: unknown = null): RequestInit {
    const agent = new https.Agent({
      rejectUnauthorized: false
    })

    return {
      method: method,
      agent,
      headers: {
        'Grpc-Metadata-macaroon': this.lndRest.hexMacaroon
      },
      body: body !== null ? JSON.stringify(body) : undefined
    }
  }
}
