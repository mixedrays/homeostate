import { DemoLayout } from "../components/DemoLayout";
import { InlineCode } from "../components/InlineCode";
import { apps } from "../demos";
import { SharedDocument } from "../editor/components/SharedDocument";
import { wsProvider, ydoc } from "../editor/store/useEditorStore";
import { EDITOR_ROOM } from "../sync";

export default function EditorDemo() {
  return (
    <DemoLayout
      demo={apps.editor}
      provider={wsProvider}
      doc={ydoc}
      back={{ to: "/", label: "All demos" }}
      footer={
        <>
          Every tab joins the room <InlineCode>{EDITOR_ROOM}</InlineCode>. Open
          a second tab to write together.
        </>
      }
    >
      <SharedDocument />
    </DemoLayout>
  );
}
