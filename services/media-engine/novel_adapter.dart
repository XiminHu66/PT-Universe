// Small noninteractive adapter; upstream MIT library stays at its pinned revision.
import 'dart:convert';
import 'dart:io';
import 'package:bili_novel_packer/light_novel/base/light_novel_source.dart';
import 'package:bili_novel_packer/light_novel/bili_novel/bili_novel_source.dart';
import 'package:bili_novel_packer/light_novel/wenku_novel/wenku_novel_source.dart';
import 'package:bili_novel_packer/novel_packer.dart';
import 'package:bili_novel_packer/pack_option.dart';
Future<void> main(List<String> args) async {
 try {
  if(args.length<2) throw ArgumentError('mode url [chapter index]');
  final uri=Uri.parse(args[1]);
  const hosts={'www.wenku8.net','wenku8.net','www.bilinovel.com','www.bilinovel.net','www.linovelib.com','w.linovelib.com'};
  if(uri.scheme!='https'||!hosts.contains(uri.host)) throw ArgumentError('Unsupported novel URL');
  final LightNovelSource source=uri.host.contains('wenku8')?WenkuNovelSource():BiliNovelSource();
  final novel=await source.getNovel(args[1]);
  final catalog=await source.getNovelCatalog(novel);
  final chapters=catalog.volumes.expand((v)=>v.chapters).toList();
  final result=<String,dynamic>{'title':novel.title,'url':args[1],'source':source.name,'author':novel.author,'fetchedAt':DateTime.now().toUtc().toIso8601String(),'chapters':[for(final c in chapters){'title':c.chapterName,'url':c.chapterUrl}]};
  if(args[0]=='chapter') {
   final index=int.parse(args[2]);
   if(index<0||index>=chapters.length)throw ArgumentError('Invalid chapter');
   final doc=await source.getNovelChapter(chapters[index]);
   result['text']=doc.body?.text??'';
   result['title']=chapters[index].chapterName;
  } else if(args[0]=='pack') {
   final option=PackOption.all(addChapterTitle:true,selectedVolumes:catalog.volumes);
   await NovelPacker(source).packCombine(source:source,novel:novel,option:option);
  } else if(args[0]!='catalog') {throw ArgumentError('Unknown mode');}
  File('result.json').writeAsStringSync(jsonEncode(result));
 }catch(e){stderr.writeln(e);exitCode=1;}
}
