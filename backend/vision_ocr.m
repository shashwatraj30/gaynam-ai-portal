#import <Foundation/Foundation.h>
#import <Vision/Vision.h>
#import <AppKit/AppKit.h>
#import <Quartz/Quartz.h>

void recognizeCGImage(CGImageRef cgImg) {
    if (!cgImg) return;
    VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:cgImg options:@{}];
    VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] init];
    request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
    request.usesLanguageCorrection = YES;
    NSError *error = nil;
    [handler performRequests:@[request] error:&error];
    if (error || request.results.count == 0) {
        request.recognitionLevel = VNRequestTextRecognitionLevelFast;
        [handler performRequests:@[request] error:&error];
    }
    for (VNRecognizedTextObservation *obs in request.results) {
        VNRecognizedText *top = [[obs topCandidates:1] firstObject];
        if (top && top.string.length > 0) {
            printf("%s\n", [top.string UTF8String]);
        }
    }
}

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        if (argc < 2) return 1;
        NSString *path = [NSString stringWithUTF8String:argv[1]];
        NSURL *url = [NSURL fileURLWithPath:path];
        if ([[path.pathExtension lowercaseString] isEqualToString:@"pdf"]) {
            PDFDocument *pdfDoc = [[PDFDocument alloc] initWithURL:url];
            if (!pdfDoc) return 2;
            NSUInteger maxPages = MIN(pdfDoc.pageCount, 8);
            for (NSUInteger i = 0; i < maxPages; i++) {
                PDFPage *page = [pdfDoc pageAtIndex:i];
                NSRect bounds = [page boundsForBox:kPDFDisplayBoxMediaBox];
                NSSize size = NSMakeSize(bounds.size.width * 2.0, bounds.size.height * 2.0);
                NSImage *img = [page thumbnailOfSize:size forBox:kPDFDisplayBoxMediaBox];
                CGImageRef cgImg = [img CGImageForProposedRect:NULL context:nil hints:nil];
                recognizeCGImage(cgImg);
            }
        } else {
            NSImage *img = [[NSImage alloc] initWithContentsOfURL:url];
            if (img) {
                CGImageRef cgImg = [img CGImageForProposedRect:NULL context:nil hints:nil];
                recognizeCGImage(cgImg);
            }
        }
    }
    return 0;
}
