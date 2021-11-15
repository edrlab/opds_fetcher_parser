import {
  ContentType,
  contentTypeisOpds,
  contentTypeisOpdsAuth,
  parseContentType,
} from '../utils/contentType';
import {IOpdsResultView} from '../interface/opds';
import {TaJsonDeserialize} from 'r2-lcp-js/dist/es6-es2015/src/serializable';
import {OPDSPublication} from 'r2-opds-js/dist/es6-es2015/src/opds/opds2/opds2-publication';
import {OPDSFeed} from 'r2-opds-js/dist/es6-es2015/src/opds/opds2/opds2';
import {Publication as R2Publication} from 'r2-shared-js/dist/es6-es2015/src/models/publication';
import {IWebPubView} from '../interface/webpub';
import {ok} from 'assert';
import {OpdsFeedViewConverter} from '../converter/opds';
import {WebpubViewConverter} from '../converter/webpub';
import {http, fetchCookieFactory} from 'ts-fetch';
import {IAuthenticationToken} from 'ts-fetch/build/src/http.type';

const debug = console.log;

export class OpdsService {
  private opdsFeedViewConverter: OpdsFeedViewConverter;
  private webpubViewConverter: WebpubViewConverter;
  private _http: http;

  constructor(authenticationToken?: Record<string, IAuthenticationToken>/*cookieStorage?: string | CookieJar.Serialized*/) {
    this.opdsFeedViewConverter = new OpdsFeedViewConverter();
    this.webpubViewConverter = new WebpubViewConverter(
      this.opdsFeedViewConverter
    );
    // const fetchInstance = fetchCookieFactory.init(cookieStorage);
    this._http = new http(fetchCookieFactory.fetch, authenticationToken);
  }

  public async feedRequest(url: string): Promise<IOpdsResultView> {
    const res = await this._http.get<IOpdsResultView>(
      url,
      undefined,
      async opdsData => {
        const {
          url: _baseUrl,
          // responseUrl,
          contentType: _contentType,
        } = opdsData;
        const baseUrl = `${_baseUrl}`;
        const contentType = parseContentType(_contentType || '');

        if (contentTypeisOpds(contentType)) {
          const json = await opdsData.response?.json();
          opdsData.data = await this.opdsRequestJsonTransformer(
            json || {},
            contentType,
            baseUrl
          );
        }

        return opdsData;
      }
    );

    ok(res.data, 'opds request error');
    return res.data;
  }

  public async webpubRequest(url: string): Promise<IWebPubView> {
    const res = await this._http.get<IWebPubView>(
      url,
      undefined,
      async webpubData => {
        const {
          url: _baseUrl,
          // responseUrl,
          contentType: _contentType,
        } = webpubData;
        const baseUrl = `${_baseUrl}`;
        const contentType = parseContentType(_contentType || '');

        if (
          contentType === ContentType.webpub ||
          contentType === ContentType.Json ||
          contentType === ContentType.JsonLd
        ) {
          const jsonObj = await webpubData.response?.json();

          const isR2Pub =
            contentType === ContentType.webpub ||
            (jsonObj.metadata &&
              jsonObj['@context'] ===
                'https://readium.org/webpub-manifest/context.jsonld' &&
              !!(
                !jsonObj.publications &&
                !jsonObj.navigation &&
                !jsonObj.groups &&
                !jsonObj.catalogs
              ));

          if (isR2Pub) {
            const r2Publication = TaJsonDeserialize(jsonObj, R2Publication);
            webpubData.data = this.webpubViewConverter.convertWebpubToView(
              r2Publication,
              baseUrl
            );
          }
        }
        return webpubData;
      }
    );

    ok(res.data, 'webpub request error');
    return res.data;
  }

  private async opdsRequestJsonTransformer(
    jsonObj: any,
    contentType: ContentType,
    // responseUrl: string,
    url: string
  ): Promise<IOpdsResultView> {
    const baseUrl = url;

    const isOpdsPub =
      contentType === ContentType.Opds2Pub ||
      (jsonObj.metadata &&
        // jsonObj.links &&
        !!(
          !jsonObj.publications &&
          !jsonObj.navigation &&
          !jsonObj.groups &&
          !jsonObj.catalogs
        ));

    const isR2Pub =
      contentType === ContentType.webpub ||
      (jsonObj.metadata &&
        jsonObj['@context'] ===
          'https://readium.org/webpub-manifest/context.jsonld' &&
        !!(
          !jsonObj.publications &&
          !jsonObj.navigation &&
          !jsonObj.groups &&
          !jsonObj.catalogs
        ));

    const isAuth =
      contentTypeisOpdsAuth(contentType) ||
      typeof jsonObj.authentication !== 'undefined';

    const isFeed =
      contentType === ContentType.Opds2 ||
      !!(
        jsonObj.publications ||
        jsonObj.navigation ||
        jsonObj.groups ||
        jsonObj.catalogs
      );

    debug(
      'isAuth, isOpdsPub, isR2Pub, isFeed',
      isAuth,
      isOpdsPub,
      isR2Pub,
      isFeed
    );

    if (isAuth) {
      // not implemeted

      debug('auth not implemented');
      // const r2OpdsAuth = TaJsonDeserialize(
      //     jsonObj,
      //     OPDSAuthenticationDoc,
      // );

      // this.dispatchAuthenticationProcess(r2OpdsAuth, responseUrl);

      return {
        title: 'Unauthorized',
        publications: [],
      }; // need to refresh the page
    } else if (isOpdsPub) {
      const r2OpdsPublication = TaJsonDeserialize(jsonObj, OPDSPublication);
      const pubView = this.opdsFeedViewConverter.convertOpdsPublicationToView(
        r2OpdsPublication,
        baseUrl
      );
      return {
        title: pubView.title,
        publications: [pubView],
      };
    } else if (isR2Pub) {
      const r2Publication = TaJsonDeserialize(jsonObj, R2Publication);

      const pub = new OPDSPublication();

      if (typeof r2Publication.Metadata === 'object') {
        pub.Metadata = r2Publication.Metadata;
      }

      const coverLink = r2Publication.searchLinkByRel('cover');
      if (coverLink) {
        pub.AddImage(
          coverLink.Href,
          coverLink.TypeLink,
          coverLink.Height,
          coverLink.Width
        );
      }

      pub.AddLink_(
        url,
        'application/webpub+json',
        'http://opds-spec.org/acquisition/open-access',
        ''
      );

      const pubView = this.opdsFeedViewConverter.convertOpdsPublicationToView(
        pub,
        baseUrl
      );

      return {
        title: pubView.title,
        publications: [pubView],
      } as IOpdsResultView;
    } else if (isFeed) {
      const r2OpdsFeed = TaJsonDeserialize(jsonObj, OPDSFeed);
      const resultView =
        this.opdsFeedViewConverter.convertOpdsFeedToView(r2OpdsFeed, baseUrl);
      return {
        ...resultView,
        publications: Array.isArray(resultView.publications) ? resultView.publications : [],
      };
    }

    return {
      title: 'error',
      publications: [],
    };
  }
}
