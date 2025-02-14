'use strict';

const Utils = require('../utils/Utils');
const Constants = require('../utils/Constants');

const { default: Signature } = require('../deciphers/Signature');
const { default: NToken } = require('../deciphers/NToken');

/** @namespace */
class Player {
  #request;
  #player_id;
  #player_url;
  #player_path;

  #ntoken;
  #signature;
  #signature_timestamp;
  #cache_dir;

  /**
   * Represents the YouTube Web player script.
   *
   * @param {string} id - the id of the player.
   * @param {import('../utils/Request')} request
   */
  constructor(id, request) {
    this.#player_id = id;
    this.#request = request;
    this.#cache_dir = `${Utils.getTmpdir()}/yt-cache`;
    this.#player_url = `${Constants.URLS.YT_BASE}/s/player/${this.#player_id}/player_ias.vflset/en_US/base.js`;
    this.#player_path = `${this.#cache_dir}/${this.#player_id}.bin`;
  }

  async init() {

    const response = await this.#request.get(this.#player_url, { headers: { 'content-type': 'text/javascript' } });

    this.#signature_timestamp = this.#extractSigTimestamp(response.data);

    const signature_decipher_sc = this.#extractSigDecipherSc(response.data);
    const ntoken_decipher_sc = this.#extractNTokenSc(response.data);

    this.#signature = Signature.fromSourceCode(signature_decipher_sc);
    this.#ntoken = NToken.fromSourceCode(ntoken_decipher_sc);

    try {
      const ntoken_buf = this.#ntoken.toArrayBuffer();
      const sig_decipher_buf = this.#signature.toArrayBuffer();
      const buffer = new ArrayBuffer(12 + sig_decipher_buf.byteLength + ntoken_buf.byteLength);

      const view = new DataView(buffer);
      view.setUint32(0, Player.LIBRARY_VERSION, true);
      view.setUint32(4, this.#signature_timestamp, true);
      view.setUint32(8, sig_decipher_buf.byteLength, true);

      new Uint8Array(buffer).set(new Uint8Array(sig_decipher_buf), 12);
      new Uint8Array(buffer).set(new Uint8Array(ntoken_buf), 12 + sig_decipher_buf.byteLength);
    } finally { /* Do nothing */ }

    return this;
  }

  decipher(url, signature_cipher, cipher) {
    url = url || signature_cipher || cipher;

    Utils.throwIfMissing({ url });

    const args = new URLSearchParams(url);
    const url_components = new URL(args.get('url') || url);

    url_components.searchParams.set('ratebypass', 'yes');

    if (signature_cipher || cipher) {
      const signature = this.#signature.decipher(url);
      args.get('sp') ?
        url_components.searchParams.set(args.get('sp'), signature) :
        url_components.searchParams.set('signature', signature);
    }

    if (url_components.searchParams.get('n')) {
      const ntoken = this.#ntoken.transform(url_components.searchParams.get('n'));
      url_components.searchParams.set('n', ntoken);
    }

    return url_components.toString();
  }

  /**
   * Js player url.
   * @returns {string}
   */
  get url() {
    return this.#player_url;
  }

  /**
   * Signature timestamp.
   * @returns {string}
   */
  get sts() {
    return this.#signature_timestamp;
  }

  static get LIBRARY_VERSION() {
    return 1;
  }

  /**
   * Extracts the signature timestamp from the player source code.
   * @param {*} data
   * @returns {number}
   */
  #extractSigTimestamp(data) {
    return parseInt(Utils.getStringBetweenStrings(data, 'signatureTimestamp:', ','));
  }

  /**
   * Extracts the signature decipher algorithm.
   * @param {*} data
   * @returns {string}
   */
  #extractSigDecipherSc(data) {
    const sig_alg_sc = Utils.getStringBetweenStrings(data, 'this.audioTracks};var', '};');
    const sig_data = Utils.getStringBetweenStrings(data, 'function(a){a=a.split("")', 'return a.join("")}');
    return sig_alg_sc + sig_data;
  }

  /**
   * Extracts the n-token decipher algorithm.
   * @param {*} data
   * @returns {string}
   */
  #extractNTokenSc(data) {
    return `var b=a.split("")${Utils.getStringBetweenStrings(data, 'b=a.split("")', '}return b.join("")}')}} return b.join("");`;
  }
}

module.exports = Player;
