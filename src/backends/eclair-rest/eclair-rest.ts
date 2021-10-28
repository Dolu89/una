import fetch, { RequestInit } from 'node-fetch'
import { IBackend, watchInvoices } from '..'
import { ICreateInvoice, IEclairRest, Invoice } from '../../interfaces'
import { EHttpVerb, EInvoiceStatus } from '../../enums'
import { IInvoiceCreated, IInvoiceLookup } from '.'
import { EventEmitter } from 'events'

export default class EclairRest implements IBackend {
  private readonly eclairRest: IEclairRest
  public readonly invoiceEmitter: EventEmitter
  public readonly invoicesToWatch: Invoice[]

  constructor (eclairRest: IEclairRest) {
    this.eclairRest = eclairRest
    this.invoicesToWatch = []
    this.invoiceEmitter = new EventEmitter()
  }

  public async createInvoice (invoice: ICreateInvoice): Promise<Invoice> {
    const amountMsat = invoice.amountMsats !== undefined ? invoice.amountMsats : invoice.amount * 1000

    const body: any = {
      amountMsat: amountMsat
    }

    if (invoice.description !== undefined && invoice.descriptionHash === undefined) {
      body.description = invoice.description
    } else if (invoice.descriptionHash !== undefined && invoice.description === undefined) {
      body.descriptionHash = invoice.descriptionHash
    } else {
      throw new Error('You must specify either description or descriptionHash, but not both')
    }
    if (invoice.expireIn !== undefined) {
      body.expireIn = invoice.expireIn
    }
    if (invoice.fallbackAddress !== undefined) {
      body.fallbackAddress = invoice.fallbackAddress
    }
    if (invoice.paymentPreimage !== undefined) {
      body.paymentPreimage = invoice.paymentPreimage
    }

    const options = this.getRequestOptions(EHttpVerb.POST, body)
    const response = await fetch(`${this.eclairRest.url}/createinvoice`, options)
    const responseData = await response.json() as IInvoiceCreated

    return await this.getInvoice(responseData.paymentHash)
  }

  public async getInvoice (hash: string): Promise<Invoice> {
    const body = {
      paymentHash: hash
    }

    const options = this.getRequestOptions(EHttpVerb.POST, body)
    const response = await fetch(this.eclairRest.url + '/getreceivedinfo', options)
    const responseData = await response.json() as IInvoiceLookup

    return this.toInvoice(responseData)
  }

  public watchInvoices (): EventEmitter {
    return this.invoiceEmitter
  }

  public startWatchingInvoices (): void {
    watchInvoices(this)
  }

  public async getPendingInvoices (): Promise<Invoice[]> {
    const options = this.getRequestOptions(EHttpVerb.POST)
    const results = await fetch(this.eclairRest.url + '/listpendinginvoices', options)
    const initalInvoices = await results.json() as IInvoiceCreated[]
    return initalInvoices.map(i => this.toInvoice2(i))
  }

  private toDate (millisecond: string): Date {
    return new Date(Number(millisecond))
  }

  private toInvoice (invoice: IInvoiceLookup): Invoice {
    let status: EInvoiceStatus = EInvoiceStatus.Pending
    let settled = false
    if (invoice.status.type === 'pending') {
      status = EInvoiceStatus.Pending
    } else if (invoice.status.type === 'received') {
      status = EInvoiceStatus.Settled
      settled = invoice.status.type === 'received'
    } else if (invoice.status.type === 'expired') {
      status = EInvoiceStatus.Cancelled
    }

    return {
      bolt11: invoice.paymentRequest.serialized,
      amount: invoice.paymentRequest.amount / 1000,
      amountMsat: invoice.paymentRequest.amount,
      creationDate: this.toDate(invoice.paymentRequest.timestamp.toString()),
      expiry: Number(invoice.paymentRequest.expiry),
      memo: invoice.paymentRequest.description,
      settled,
      settleDate: settled ? this.toDate(invoice.status.receivedAt.toString()) : null,
      paymentHash: invoice.paymentRequest.paymentHash,
      preImage: invoice.paymentPreimage,
      status
    }
  }

  private toInvoice2 (invoice: IInvoiceCreated): Invoice {
    return {
      bolt11: invoice.serialized,
      amount: invoice.amount / 1000,
      amountMsat: invoice.amount,
      creationDate: this.toDate(invoice.timestamp.toString()),
      expiry: Number(invoice.expiry),
      memo: invoice.description,
      settled: false,
      settleDate: null,
      paymentHash: invoice.paymentHash,
      status: EInvoiceStatus.Pending
    }
  }

  private getRequestOptions (method: EHttpVerb, body: any = null): RequestInit {
    const formDataString = new URLSearchParams(body).toString()

    return {
      method: method,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(`${this.eclairRest.user}:${this.eclairRest.password}`).toString('base64')
      },
      body: formDataString
    }
  }
}
