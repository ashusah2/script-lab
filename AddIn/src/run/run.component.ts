import {Component, OnInit, OnDestroy, ViewChild, ElementRef} from '@angular/core';
import {Router, ActivatedRoute} from '@angular/router';
import {BaseComponent} from '../shared/components/base.component';
import {Utilities} from '../shared/helpers';
import {Snippet, SnippetManager} from '../shared/services';

interface CreateHtmlOptions {
    inlineJsAndCssIntoIframe: boolean,
    includeOfficeInitialize: boolean
}

@Component({
    selector: 'run',
    templateUrl: 'run.component.html',
    styleUrls: ['run.component.scss'],
})
export class RunComponent extends BaseComponent implements OnInit, OnDestroy {
    @ViewChild('runner') runner: ElementRef;
    @ViewChild('console') console: ElementRef;
    snippet: Snippet;

    private _originalConsole: Console;
    private _createHtmlOptions: CreateHtmlOptions

    constructor(
        private _snippetManager: SnippetManager,
        private _route: ActivatedRoute,
        private _router: Router
    ) {
        super();
        this._originalConsole = window.console;
        this._monkeyPatchConsole(window);

        this._createHtmlOptions = {
            includeOfficeInitialize: false /*FIXME*/,
            inlineJsAndCssIntoIframe: true
        }; 
    }

    ngOnInit() {
        var subscription = this._route.params.subscribe(params => {
            var snippetName = Utilities.decode(params['name']);
            if (Utilities.isEmpty(snippetName)) return;
            this.snippet = this._snippetManager.findByName(snippetName);

            var iframe = this.runner.nativeElement;
            var iframeWindow: Window = (<any>iframe).contentWindow;
            this.createHtml(this._createHtmlOptions).then(function (fullHtml) {
                iframeWindow.document.open();
                iframeWindow.document.write(fullHtml);
                iframeWindow.document.close();
            }).catch(function (e) {
                console.log(e);
                // TODO eventually Util instead
            });
        });

        this.markDispose(subscription);

        window["iframeReadyCallback"] = (iframeWin) => {
            if (this._createHtmlOptions.includeOfficeInitialize) {
                iframeWin['Office'] = (<any>window).Office;
                iframeWin['Excel'] = (<any>window).Excel;
            }

            this._monkeyPatchConsole(iframeWin);
            
            var that = this;
            iframeWin.onerror = function() {
                that.consoleCommon('error', arguments);
            }
        }
    }

    ngOnDestroy() {
        super.ngOnDestroy();
        console = this._originalConsole;
    }

    createHtml(options: CreateHtmlOptions): Promise<string> {
        // TODO: Tabbing of created HTML could use some love

        return this.snippet.js.then(js => {
            var html = [
                '<!DOCTYPE html>',
                '<html>',
                '<head>',
                '    <meta charset="UTF-8" />',
                '    <meta http-equiv="X-UA-Compatible" content="IE=Edge" />',
                '    <title>Running snippet</title>',
                this.snippet.getJsLibaries().map(item => '    <script src="' + item + '"></script>').join("\n"),
                this.snippet.getCssStylesheets().map((item) => '    <link rel="stylesheet" href="' + item + '" />').join("\n"),
            ];

            if (options.inlineJsAndCssIntoIframe) {
                html.push(
                    "    <style>",
                    this.snippet.css,
                    "    </style>",
                    "    <script>"
                );

                if (options.includeOfficeInitialize) {
                    html.push('        Office.initialize = function (reason) {');
                }

                html.push('            $(document).ready(function () {');

                if (options.inlineJsAndCssIntoIframe) {
                    html.push('                parent.iframeReadyCallback(window);');
                }
                
                html.push(
                    js,
                    '            });'
                );

                if (options.includeOfficeInitialize) {
                    html.push('        };');
                }

                html.push(
                    "    </script>"
                );
            } else {
                html.push(
                    "    <link type='text/css' rel='stylesheet' href='app.css' />",
                    "    <script src='app.js'></script>"
                );
            }

            html.push(
                '</head>',
                '<body>',
                this.snippet.html,
                '</body>',
                '</html>'
            );

            return Utilities.stripSpaces(html.join('\n'));
        })
    }

    private _monkeyPatchConsole(windowToPatch: Window) {
        // Taken from http://tobyho.com/2012/07/27/taking-over-console-log/
        var console = windowToPatch.console;
        var that = this;
        if (!console) return
        function intercept(method){
            var original = console[method];
            console[method] = function() {
                that.consoleCommon(method, arguments);
                if (original.apply){
                    // Do this for normal browsers
                    original.apply(console, arguments);
                }else{
                    // Do this for IE
                    var message = Array.prototype.slice.apply(arguments).join(' ');
                    original(message);
                }
            }
        }
        var methods = ['log', 'warn', 'error'];
        for (var i = 0; i < methods.length; i++) {
            intercept(methods[i]);
        }
    }

    private consoleCommon(consoleMethodType: string, args: IArguments) {
        var message = '';
        _.each(args, arg => {
            if (_.isString(arg)) message += arg + ' ';
            else if (_.object(arg) || _.isArray(arg)) message += JSON.stringify(arg) + ' ';
        });
        message += '\n';
        var span = document.createElement("span");
        span.classList.add("console");
        span.classList.add(consoleMethodType);
        span.innerText = message;
        $(this.console.nativeElement).append(span);
    }

    back() {
        this._router.navigate(['edit', Utilities.encode(this.snippet.meta.name)]);
    }
}